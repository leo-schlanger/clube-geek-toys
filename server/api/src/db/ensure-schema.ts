import { query } from '../config/database.js';

/**
 * Idempotent schema migrations applied at API startup.
 *
 * Why this exists: the production deploy uses `docker-entrypoint-initdb.d` which only runs on
 * first volume creation. Manual SSH migrations are error-prone and easy to forget. By running
 * idempotent DDL on boot, the schema is always in sync with the deployed code.
 *
 * RULES:
 *  - Every statement here MUST be idempotent (CREATE TABLE IF NOT EXISTS, ALTER TABLE ... IF NOT
 *    EXISTS, ADD COLUMN IF NOT EXISTS, etc).
 *  - Never DROP or rename existing columns here — that's a real migration and needs care.
 *  - Order matters: dependencies (FKs) come last.
 *  - Failures here MUST NOT crash the API. Log loudly and continue — operator can fix manually.
 */
export async function ensureSchema(): Promise<void> {
  const start = Date.now();
  try {
    // ─── Wave 1.9 — One-time email verification tokens ────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS consumed_verification_tokens (
        token_hash VARCHAR(64) PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_consumed_tokens_consumed_at
        ON consumed_verification_tokens(consumed_at)
    `);

    // ─── Wave 2.5 — Settings table (config) is already in schema.sql; no-op here ───

    // ─── Stripe migration — stripe_customer_id on members ────────────────────────
    await query(`
      ALTER TABLE members ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_members_stripe_customer
        ON members(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL
    `);

    // ─── Refund audit trail — reason column on payments ────────────────────────
    await query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_reason TEXT
    `);

    // ─── Payment count — contador de pagamentos (usado em relatórios/webhook) ────
    await query(`
      ALTER TABLE members ADD COLUMN IF NOT EXISTS payment_count INTEGER NOT NULL DEFAULT 0
    `);

    // ─── Missing indexes for reports and LGPD queries ────────────────────────
    await query(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status_created
        ON subscriptions(status, created_at DESC)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_audit_user_id
        ON audit_logs(user_id)
    `);

    // ─── Single-plan migration (008) — collapse plans to 'club', drop points ────
    // Wrapped in its own try/catch so a failure here can NEVER skip later blocks
    // (e.g. the shop tables). Order matters: DROP the legacy CHECK constraints
    // BEFORE normalizing plan→'club', otherwise the UPDATE violates the old
    // `plan IN ('silver','gold','black')` constraint and the whole sync aborts.
    try {
      await query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS members_plan_check`);
      await query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS chk_members_plan`);
      await query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS members_payment_type_check`);
      await query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS chk_members_payment_type`);
      await query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS chk_points_non_negative`);
      await query(`UPDATE members SET plan = 'club' WHERE plan <> 'club'`);
      await query(`UPDATE members SET payment_type = 'annual' WHERE payment_type <> 'annual'`);
      await query(`DROP TABLE IF EXISTS point_transactions CASCADE`);
      await query(`ALTER TABLE members DROP COLUMN IF EXISTS points`);
      await query(`ALTER TABLE members ALTER COLUMN plan SET DEFAULT 'club'`);
      await query(`ALTER TABLE members ALTER COLUMN payment_type SET DEFAULT 'annual'`);
      await query(`DO $$ BEGIN
        ALTER TABLE members ADD CONSTRAINT chk_members_plan CHECK (plan IN ('club'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
      await query(`DO $$ BEGIN
        ALTER TABLE members ADD CONSTRAINT chk_members_payment_type CHECK (payment_type IN ('annual'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    } catch (err) {
      console.error('[SCHEMA] single-plan migration block failed (non-fatal):', err);
    }

    // ─── CHECK constraints for enum columns ────────────────────────
    await query(`DO $$ BEGIN
      ALTER TABLE members ADD CONSTRAINT chk_members_status CHECK (status IN ('active','pending','inactive','expired'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(`DO $$ BEGIN
      ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('member','seller','admin','disabled'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(`DO $$ BEGIN
      ALTER TABLE payments ADD CONSTRAINT chk_payments_method CHECK (method IN ('pix','credit_card','boleto','cash'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(`DO $$ BEGIN
      ALTER TABLE payments ADD CONSTRAINT chk_payments_status CHECK (status IN ('pending','paid','failed','refunded'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    // ─── Shop / e-commerce (migration 009) ───────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(120) NOT NULL,
        slug VARCHAR(140) NOT NULL UNIQUE,
        description TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(200) NOT NULL,
        slug VARCHAR(220) NOT NULL UNIQUE,
        description TEXT,
        price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
        compare_at_price DECIMAL(10,2) CHECK (compare_at_price >= 0),
        category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
        images JSONB NOT NULL DEFAULT '[]',
        stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
        sku VARCHAR(60),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_number SERIAL,
        member_id UUID REFERENCES members(id) ON DELETE SET NULL,
        customer_name VARCHAR(200) NOT NULL,
        customer_email VARCHAR(254) NOT NULL,
        customer_phone VARCHAR(20),
        shipping_address JSONB,
        subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
        discount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
        discount_reason VARCHAR(40),
        shipping_cost DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
        total DECIMAL(10,2) NOT NULL CHECK (total >= 0),
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','paid','processing','shipped','delivered','cancelled','refunded')),
        payment_method VARCHAR(20) CHECK (payment_method IN ('pix','credit_card')),
        stripe_payment_intent_id TEXT,
        pix_txid TEXT,
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        product_name VARCHAR(200) NOT NULL,
        product_slug VARCHAR(220),
        unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        line_total DECIMAL(10,2) NOT NULL CHECK (line_total >= 0),
        image_url TEXT
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_products_active ON products(active) WHERE active = TRUE`);
    await query(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured) WHERE featured = TRUE`);
    await query(`CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(active) WHERE active = TRUE`);
    await query(`CREATE INDEX IF NOT EXISTS idx_orders_member ON orders(member_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_orders_pi ON orders(stripe_payment_intent_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)`);
    await query(`DO $$ BEGIN
      CREATE TRIGGER tr_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(`DO $$ BEGIN
      CREATE TRIGGER tr_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(`DO $$ BEGIN
      CREATE TRIGGER tr_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    console.log(`[SCHEMA] ensureSchema completed in ${Date.now() - start}ms`);
  } catch (err) {
    // Loud-fail but don't crash the API. The operator should investigate via logs.
    console.error('[SCHEMA] ⚠ ensureSchema failed — some features may be degraded:', err);
  }
}
