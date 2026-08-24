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
 *
 * Why steps: this was once a single `try` around all the DDL, so one failing
 * step aborted **every later one** silently, while the API served traffic and
 * `/health` answered `ok`. Now each step fails alone, the rest continue, and
 * the outcome is readable in
 * `GET /health` (`schema.status`). See `getSchemaState()`.
 */

type SchemaStep = { name: string; run: () => Promise<void> };

export type SchemaStepFailure = { step: string; error: string };

export type SchemaState = {
  /** Has not run yet (boot in progress). */
  status: 'pending' | 'ok' | 'degraded';
  ranAt: string | null;
  durationMs: number;
  total: number;
  failed: SchemaStepFailure[];
};

const STEPS: SchemaStep[] = [
  {
    name: "Wave 1.9 — One-time email verification tokens",
    run: async () => {
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
    },
  },
  // Wave 2.5 — the `config` table already ships in schema.sql, so no step here.
  {
    name: "Stripe migration — stripe_customer_id on members",
    run: async () => {
    await query(`
      ALTER TABLE members ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_members_stripe_customer
        ON members(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL
    `);
    },
  },
  {
    name: "Refund audit trail — reason column on payments",
    run: async () => {
    await query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_reason TEXT
    `);
    },
  },
  {
    name: "Payment count — used in reports and webhooks",
    run: async () => {
    await query(`
      ALTER TABLE members ADD COLUMN IF NOT EXISTS payment_count INTEGER NOT NULL DEFAULT 0
    `);
    },
  },
  {
    name: "Missing indexes for reports and LGPD queries",
    run: async () => {
    await query(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status_created
        ON subscriptions(status, created_at DESC)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_audit_user_id
        ON audit_logs(user_id)
    `);
    },
  },
  {
    name: "Single-plan migration (008) — collapse plans to 'club', drop points",
    run: async () => {
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
      await query(`DROP TABLE IF EXISTS point_transactions CASCADE`);
      await query(`ALTER TABLE members DROP COLUMN IF EXISTS points`);
      await query(`ALTER TABLE members ALTER COLUMN plan SET DEFAULT 'club'`);
      await query(`DO $$ BEGIN
        ALTER TABLE members ADD CONSTRAINT chk_members_plan CHECK (plan IN ('club'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
      // payment_type default + CHECK live in step 032 (monthly). Do not force
      // `annual` here: this block runs on every boot.
    } catch (err) {
      console.error('[SCHEMA] single-plan migration block failed (non-fatal):', err);
    }
    },
  },
  {
    name: "CHECK constraints for enum columns",
    run: async () => {
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
    },
  },
  {
    name: "Shop / e-commerce (migration 009)",
    run: async () => {
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
    },
  },
  {
    name: "Shop shipping / reviews / credit (migration 010)",
    run: async () => {
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_g INTEGER`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS height_cm NUMERIC(6,1)`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS width_cm NUMERIC(6,1)`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS length_cm NUMERIC(6,1)`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0`);

    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service VARCHAR(40)`);
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service_id TEXT`);
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_days INTEGER`);
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(64)`);
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT`);
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_credit_applied DECIMAL(10,2) NOT NULL DEFAULT 0`);
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS melhor_envio_cart_id TEXT`);
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS melhor_envio_order_id TEXT`);
    await query(`CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_code) WHERE tracking_code IS NOT NULL`);

    await query(`
      CREATE TABLE IF NOT EXISTS product_reviews (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        member_id UUID REFERENCES members(id) ON DELETE SET NULL,
        rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        title VARCHAR(120),
        body TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'published'
          CHECK (status IN ('pending', 'published', 'hidden')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (order_id, product_id)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_reviews_product ON product_reviews(product_id, status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_reviews_user ON product_reviews(user_id)`);

    await query(`
      CREATE TABLE IF NOT EXISTS store_credits (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        balance DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS store_credit_ledger (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        reason VARCHAR(40) NOT NULL,
        order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
        review_id UUID REFERENCES product_reviews(id) ON DELETE SET NULL,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON store_credit_ledger(user_id, created_at DESC)`);
    await query(`
      INSERT INTO config (key, value) VALUES ('review_reward_amount', '1.00'::jsonb)
      ON CONFLICT (key) DO NOTHING
    `);
    },
  },
  {
    name: "Shop data integrity (migration 011)",
    run: async () => {
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id) WHERE user_id IS NOT NULL`);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_review_reward_once
        ON store_credit_ledger (order_id)
        WHERE reason = 'review_reward' AND order_id IS NOT NULL
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_order_refund_credit_once
        ON store_credit_ledger (order_id)
        WHERE reason = 'order_refund_credit' AND order_id IS NOT NULL
    `);
    },
  },
  {
    name: "Wholesale / Atacado (migration 012)",
    run: async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS wholesale_accounts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        cnpj VARCHAR(14) NOT NULL UNIQUE,
        company_name VARCHAR(200) NOT NULL,
        trade_name VARCHAR(200),
        state_registration VARCHAR(40),
        phone VARCHAR(20),
        contact_name VARCHAR(200) NOT NULL,
        business_activity TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected', 'disabled')),
        rejection_reason TEXT,
        reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        admin_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_wholesale_status ON wholesale_accounts(status, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_wholesale_cnpj ON wholesale_accounts(cnpj)`);
    await query(`DO $$ BEGIN
      CREATE TRIGGER tr_wholesale_accounts_updated_at
        BEFORE UPDATE ON wholesale_accounts
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_min_qty INTEGER NOT NULL DEFAULT 1`);
    // CHECK may be missing if column was added without it on an older ensureSchema run
    await query(`DO $$ BEGIN
      ALTER TABLE products ADD CONSTRAINT chk_products_wholesale_min_qty CHECK (wholesale_min_qty >= 1);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    // Normalize invalid mins (should not happen; defensive)
    await query(`UPDATE products SET wholesale_min_qty = 1 WHERE wholesale_min_qty IS NULL OR wholesale_min_qty < 1`);
    await query(`CREATE INDEX IF NOT EXISTS idx_products_wholesale
      ON products(wholesale_enabled) WHERE wholesale_enabled = TRUE AND active = TRUE`);

    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'retail'`);
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_cnpj VARCHAR(14)`);
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS wholesale_account_id UUID`);
    // FK after column exists (idempotent)
    await query(`DO $$ BEGIN
      ALTER TABLE orders
        ADD CONSTRAINT fk_orders_wholesale_account
        FOREIGN KEY (wholesale_account_id) REFERENCES wholesale_accounts(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(`DO $$ BEGIN
      ALTER TABLE orders ADD CONSTRAINT chk_orders_channel CHECK (channel IN ('retail', 'wholesale'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    // Backfill channel for any NULL rows (should not exist with DEFAULT)
    await query(`UPDATE orders SET channel = 'retail' WHERE channel IS NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_orders_wholesale ON orders(wholesale_account_id)
      WHERE wholesale_account_id IS NOT NULL`);

    await query(`
      INSERT INTO config (key, value) VALUES
        ('wholesale.enabled', 'true'::jsonb),
        ('wholesale.discount_percent', '25'::jsonb)
      ON CONFLICT (key) DO NOTHING
    `);
    },
  },
  {
    name: "Product variants / Shopee-style (migration 013)",
    run: async () => {
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_axes JSONB NOT NULL DEFAULT '[]'::jsonb`);
    await query(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        options JSONB NOT NULL DEFAULT '{}'::jsonb,
        sku VARCHAR(60),
        price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
        compare_at_price DECIMAL(10,2),
        stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
        images JSONB NOT NULL DEFAULT '[]'::jsonb,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_variants_product_active
      ON product_variants(product_id) WHERE active = TRUE`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_product_name
      ON product_variants(product_id, name)`);
    await query(`DO $$ BEGIN
      CREATE TRIGGER tr_product_variants_updated_at
        BEFORE UPDATE ON product_variants
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL`);
    await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_label VARCHAR(200)`);
    },
  },
  {
    name: "Multiple categories per product (migration 014)",
    run: async () => {
    // products.category_id segue sendo a principal (position 0).
    await query(`
      CREATE TABLE IF NOT EXISTS product_categories (
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (product_id, category_id)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_product_categories_product ON product_categories(product_id, position)`);
    await query(`
      INSERT INTO product_categories (product_id, category_id, position)
      SELECT id, category_id, 0 FROM products WHERE category_id IS NOT NULL
      ON CONFLICT (product_id, category_id) DO NOTHING
    `);
    },
  },
  {
    name: "Stock control (migration 015)",
    run: async () => {
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 3`);
    await query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
        order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
        kind VARCHAR(20) NOT NULL
          CHECK (kind IN ('sale', 'restock', 'adjustment', 'manual_in', 'manual_out')),
        quantity INTEGER NOT NULL,
        stock_after INTEGER,
        note TEXT,
        actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id, created_at DESC)
      WHERE variant_id IS NOT NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_order ON stock_movements(order_id)
      WHERE order_id IS NOT NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at DESC)`);
    },
  },
  {
    name: "Product videos (migration 016)",
    run: async () => {
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS videos JSONB NOT NULL DEFAULT '[]'::jsonb`);
    },
  },
  {
    name: "Questions + notifications (migration 017)",
    run: async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS product_questions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        member_id UUID REFERENCES members(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'published'
          CHECK (status IN ('published', 'hidden')),
        answer_body TEXT,
        answered_by UUID REFERENCES users(id) ON DELETE SET NULL,
        answered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_questions_product ON product_questions(product_id, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_questions_user ON product_questions(user_id, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_questions_pending
      ON product_questions(created_at DESC) WHERE answered_at IS NULL`);
    await query(`DO $$ BEGIN
      CREATE TRIGGER tr_product_questions_updated_at
        BEFORE UPDATE ON product_questions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind VARCHAR(40) NOT NULL,
        title VARCHAR(200) NOT NULL,
        body TEXT,
        link TEXT,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL`);
    },
  },
  {
    name: "Category icon (migration 018)",
    run: async () => {
    await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon VARCHAR(40)`);
    },
  },
  {
    name: "Gallery albums (migration 019)",
    run: async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS gallery_albums (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(160) NOT NULL,
        slug VARCHAR(180) NOT NULL UNIQUE,
        description TEXT,
        cover_url TEXT,
        event_date DATE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS gallery_photos (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        album_id UUID NOT NULL REFERENCES gallery_albums(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        caption VARCHAR(300),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_gallery_albums_active
      ON gallery_albums(active, sort_order, event_date DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_gallery_photos_album
      ON gallery_photos(album_id, sort_order, created_at)`);
    await query(`DO $$ BEGIN
      CREATE TRIGGER tr_gallery_albums_updated_at
        BEFORE UPDATE ON gallery_albums
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    },
  },
  {
    name: "Customer profile without a club plan + saved products (migration 020)",
    run: async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS customer_profiles (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        full_name VARCHAR(200),
        phone VARCHAR(20),
        birth_date DATE,
        gender VARCHAR(20) CHECK (gender IN (
          'feminino', 'masculino', 'nao_binario', 'outro', 'prefiro_nao_dizer'
        )),
        photo_url TEXT,
        address JSONB,
        marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS saved_products (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, product_id)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_saved_products_user
      ON saved_products(user_id, created_at DESC)`);
    await query(`DO $$ BEGIN
      CREATE TRIGGER tr_customer_profiles_updated_at
        BEFORE UPDATE ON customer_profiles
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    },
  },
  {
    name: "Stock reservation between create and paid (migration 021)",
    run: async () => {
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved INTEGER NOT NULL DEFAULT 0`);
    await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS reserved INTEGER NOT NULL DEFAULT 0`);
    await query(`DO $$ BEGIN
      ALTER TABLE products ADD CONSTRAINT chk_products_reserved CHECK (reserved >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(`DO $$ BEGIN
      ALTER TABLE product_variants ADD CONSTRAINT chk_variants_reserved CHECK (reserved >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ`);
    await query(`CREATE INDEX IF NOT EXISTS idx_orders_reservation_expiry
      ON orders(reservation_expires_at) WHERE stock_reserved = TRUE`);
    // Backfill: the pending orders that already exist do hold real stock, and
    // skipping them would leave `reserved` lying from the first minute.
    // One call, no parameters: Postgres wraps a multi-statement simple query in
    // an implicit transaction, so `reserved` and the flag on the order advance
    // together.
    //
    // Runs ONCE, guarded by a config key. `stock_reserved = FALSE` was not a
    // sufficient guard: the TTL cron releases an expired hold and deliberately
    // leaves the order `pending` (a late PIX can still be confirmed), which is
    // exactly the shape this backfill matches. Every deploy — and the deploy
    // does `--force-recreate api` — silently re-took holds the cron had just
    // released, keeping stock off the shelf until the next 6am sweep.
    const backfilled = await query(
      `INSERT INTO config (key, value)
       VALUES ('migration.021_stock_reservation_backfill', 'true'::jsonb)
       ON CONFLICT (key) DO NOTHING
       RETURNING key`
    );
    if (backfilled.rows.length === 0) return;
    await query(`
      UPDATE products p
         SET reserved = p.reserved + x.qty
        FROM (
              SELECT oi.product_id, SUM(oi.quantity)::int AS qty
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
               WHERE o.status = 'pending'
                 AND o.stock_reserved = FALSE
                 AND oi.variant_id IS NULL
                 AND oi.product_id IS NOT NULL
               GROUP BY oi.product_id
             ) x
       WHERE x.product_id = p.id;

      UPDATE product_variants v
         SET reserved = v.reserved + x.qty
        FROM (
              SELECT oi.variant_id, SUM(oi.quantity)::int AS qty
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
               WHERE o.status = 'pending'
                 AND o.stock_reserved = FALSE
                 AND oi.variant_id IS NOT NULL
               GROUP BY oi.variant_id
             ) x
       WHERE x.variant_id = v.id;

      UPDATE orders
         SET stock_reserved = TRUE,
             reservation_expires_at = created_at + INTERVAL '24 hours'
       WHERE status = 'pending' AND stock_reserved = FALSE;

      UPDATE products p
         SET reserved = COALESCE((
               SELECT SUM(v.reserved)::int FROM product_variants v
                WHERE v.product_id = p.id AND v.active = TRUE
             ), 0)
       WHERE COALESCE(p.has_variants, FALSE) = TRUE;
    `);
    },
  },
  {
    name: "Product cost / margin (migration 022)",
    run: async () => {
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2)`);
    await query(`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2)`);
    await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10,2)`);
    await query(`DO $$ BEGIN
      ALTER TABLE products ADD CONSTRAINT chk_products_cost_price CHECK (cost_price >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(`DO $$ BEGIN
      ALTER TABLE product_variants ADD CONSTRAINT chk_variants_cost_price CHECK (cost_price >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(`DO $$ BEGIN
      ALTER TABLE order_items ADD CONSTRAINT chk_order_items_unit_cost CHECK (unit_cost >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(`CREATE INDEX IF NOT EXISTS idx_products_cost_price
      ON products(cost_price) WHERE cost_price IS NOT NULL`);
    },
  },
  {
    name: "Guest order claim (migration 023)",
    run: async () => {
    await query(`CREATE INDEX IF NOT EXISTS idx_orders_guest_email
      ON orders (lower(customer_email)) WHERE user_id IS NULL`);
    },
  },
  {
    name: "Per-device refresh sessions (migration 024)",
    run: async () => {
    await query(`CREATE TABLE IF NOT EXISTS refresh_sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      prev_token_hash TEXT,
      rotated_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_agent TEXT
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_refresh_sessions_user ON refresh_sessions(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_refresh_sessions_expires ON refresh_sessions(expires_at)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_refresh_sessions_prev
      ON refresh_sessions(prev_token_hash) WHERE prev_token_hash IS NOT NULL`);
    // Move live sessions and clear the old column in the same step: a later
    // backfill with the column still populated would revive a revoked token.
    await query(`INSERT INTO refresh_sessions (user_id, token_hash, expires_at)
      SELECT id, refresh_token_hash, NOW() + INTERVAL '30 days'
        FROM users WHERE refresh_token_hash IS NOT NULL
      ON CONFLICT (token_hash) DO NOTHING`);
    await query(`UPDATE users SET refresh_token_hash = NULL, prev_refresh_token_hash = NULL
      WHERE refresh_token_hash IS NOT NULL OR prev_refresh_token_hash IS NOT NULL`);
    },
  },
  {
    name: "Queue age via status-changed-at (migration 025)",
    run: async () => {
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ`);
    await query(`UPDATE orders SET status_changed_at = updated_at WHERE status_changed_at IS NULL`);
    await query(`CREATE OR REPLACE FUNCTION set_order_status_changed_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.status_changed_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`);
    await query(`DROP TRIGGER IF EXISTS tr_orders_status_changed_at ON orders`);
    await query(`CREATE TRIGGER tr_orders_status_changed_at
      BEFORE UPDATE ON orders
      FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status)
      EXECUTE FUNCTION set_order_status_changed_at()`);
    await query(`CREATE INDEX IF NOT EXISTS idx_orders_status_changed_at
      ON orders(status, status_changed_at)`);
    },
  },
  {
    name: "Customer note on the order (migration 026)",
    run: async () => {
    await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_note TEXT`);
    await query(`DO $$ BEGIN
      ALTER TABLE orders ADD CONSTRAINT chk_orders_customer_note_len
        CHECK (customer_note IS NULL OR length(customer_note) <= 500);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    },
  },
  {
    name: "Named event tickets (migration 027)",
    run: async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS event_reservations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_id TEXT NOT NULL,
        code VARCHAR(16) NOT NULL UNIQUE,
        buyer_name TEXT NOT NULL,
        buyer_email TEXT NOT NULL,
        buyer_phone TEXT NOT NULL,
        quantity INT NOT NULL CHECK (quantity > 0),
        total_cents INT NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'confirmed', 'cancelled')),
        notes TEXT,
        confirmed_at TIMESTAMPTZ,
        confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_event_reservations_event ON event_reservations(event_id, status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_event_reservations_created ON event_reservations(created_at DESC)`);
    await query(`
      CREATE TABLE IF NOT EXISTS event_tickets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        reservation_id UUID NOT NULL REFERENCES event_reservations(id) ON DELETE CASCADE,
        event_id TEXT NOT NULL,
        code VARCHAR(24) NOT NULL UNIQUE,
        attendee_name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'full' CHECK (kind IN ('full', 'member', 'free')),
        price_cents INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'valid', 'used', 'cancelled')),
        used_at TIMESTAMPTZ,
        used_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_event_tickets_reservation ON event_tickets(reservation_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_event_tickets_event_status ON event_tickets(event_id, status)`);
    },
  },
  {
    name: "Store pickup at checkout (migration 028)",
    run: async () => {
    await query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(16) NOT NULL DEFAULT 'shipping'`
    );
    await query(`DO $$ BEGIN
      ALTER TABLE orders ADD CONSTRAINT chk_orders_delivery_method
        CHECK (delivery_method IN ('shipping', 'pickup'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(`DO $$ BEGIN
      ALTER TABLE orders ADD CONSTRAINT chk_orders_pickup_no_shipping_cost
        CHECK (delivery_method <> 'pickup' OR shipping_cost = 0);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_orders_delivery_method_status ON orders(delivery_method, status)`
    );
    },
  },
  {
    name: "Admin-managed events (migration 029)",
    run: async () => {
    // Until this step the event lived hardcoded in three files and two repos,
    // so a change needed a deploy. The table is now the source of truth; the
    // files are first-load fallback only.
    //
    // `id` is TEXT (not UUID) on purpose: `event_reservations.event_id` and
    // `event_tickets.event_id` already store the old textual id, and a UUID
    // swap would void tickets already in circulation.
    await query(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'published', 'archived')),
        title TEXT NOT NULL,
        short_title TEXT NOT NULL DEFAULT '',
        banner_text TEXT NOT NULL DEFAULT '',
        banner_image_url TEXT,
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ,
        location_name TEXT NOT NULL DEFAULT '',
        location_address TEXT NOT NULL DEFAULT '',
        location_maps_url TEXT,
        description JSONB NOT NULL DEFAULT '[]'::jsonb,
        highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
        member_perk TEXT,
        reservations_open BOOLEAN NOT NULL DEFAULT TRUE,
        price_cents INT CHECK (price_cents IS NULL OR price_cents >= 0),
        currency_label TEXT NOT NULL DEFAULT 'R$',
        max_per_reservation INT CHECK (max_per_reservation IS NULL OR max_per_reservation > 0),
        whatsapp_number TEXT NOT NULL DEFAULT '',
        reservation_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_events_status_start ON events(status, starts_at DESC)`);
    await query(`DO $$ BEGIN
      CREATE TRIGGER tr_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    // Seed: the previously hardcoded event, with the new date and venue
    // (flyer moved to 20/09 at Mar Palace). Keep the old id so issued tickets
    // stay valid. `DO NOTHING` — after this the admin owns the row; a redeploy
    // must not overwrite their edit.
    await query(
      `INSERT INTO events (
         id, slug, status, title, short_title, banner_text,
         starts_at, ends_at, location_name, location_address, location_maps_url,
         description, highlights, member_perk,
         reservations_open, price_cents, currency_label, max_per_reservation,
         whatsapp_number, reservation_notes
       ) VALUES (
         'kpop-night-2026-09-06', 'kpop-night', 'published',
         'Photocard Trading + Dança Livre de K-pop',
         'Photocard Trading',
         '🎉 Photocard Trading + Dança Livre · domingo 20/set, 14h–18h · Entrada R$ 20',
         '2026-09-20T14:00:00-03:00', '2026-09-20T18:00:00-03:00',
         'Mar Palace Copacabana Hotel',
         'Avenida Nossa Senhora de Copacabana, 552 — Copacabana, Rio de Janeiro — RJ',
         'https://maps.google.com/?q=Mar+Palace+Copacabana+Hotel,+Avenida+Nossa+Senhora+de+Copacabana,+552,+Copacabana,+Rio+de+Janeiro',
         $1::jsonb, $2::jsonb,
         'Membros do Clube: 50% de desconto na entrada (R$ 10). Criança de colo e PCD: isentos.',
         TRUE, 2000, 'R$', NULL,
         '5511914662881',
         'Entrada R$ 20/pessoa (membros do Clube: R$ 10). Criança de colo e criança com deficiência não pagam. Cada pessoa recebe um ingresso nominal com QR Code próprio, liberado assim que a equipe confirmar o pagamento.'
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        JSON.stringify([
          'Um dia inteiro no Mar Palace Copacabana Hotel para trocar photocards, dançar e celebrar o K-pop. Troque, dance e faça amizades — todos os fãs reunidos em um dia incrível.',
          'Entrada: R$ 20 por pessoa, com lanches grátis. Criança de colo e criança com deficiência (PCD) não pagam. Membros do Clube GeekPop & Toys têm 50% de desconto (R$ 10) — apresente a carteirinha digital ou o CPF na porta.',
        ]),
        JSON.stringify([
          'Domingo, 20 de setembro · 14h às 18h',
          'Mar Palace Copacabana Hotel — novo local!',
          'Photocard trading + dança livre de K-pop',
          'Lanches grátis',
          'Entrada R$ 20 por pessoa',
          'Criança de colo e criança PCD: entrada gratuita',
        ]),
      ]
    );
    },
  },
  {
    name: "Default icon per category (migration 030)",
    run: async () => {
    // Categories shipped with no icon, so consumers fell back to a generic one
    // (the institutional site drew a music note on every row). Fill once from
    // the name; after that the admin edits from the Categories tab.
    const guesses: [string, string][] = [
      ['k-?pop', 'star'],
      ['photocard|foto', 'camera'],
      ['music|músic|musica', 'music'],
      ['pok[eé]mon', 'zap'],
      ['anime|mang', 'cat'],
      ['beleza|maquia', 'heart'],
      ['moda|vestu[aá]rio|roupa|camiseta', 'shirt'],
      ['jogo|game', 'gamepad'],
      ['comida|food|doce', 'cookie'],
      ['beb[eê]', 'baby'],
      ['pet|animal', 'paw'],
      ['decora', 'palette'],
      ['papelaria|caderno', 'book'],
      ['acess[oó]rio', 'sparkles'],
      ['brinquedo', 'gift'],
      ['casa|eletro', 'home'],
    ];
    for (const [pattern, icon] of guesses) {
      // Only fill empties: a hand-picked icon is not reverted.
      await query(
        `UPDATE categories SET icon = $1
         WHERE (icon IS NULL OR icon = '') AND (name ~* $2 OR slug ~* $2)`,
        [icon, pattern]
      );
    }
    // Leftover with no guess gets a generic icon so the storefront is not
    // half-icon, half-empty.
    await query(`UPDATE categories SET icon = 'sparkles' WHERE icon IS NULL OR icon = ''`);

    // One-off: the only two categories that already had an icon were **both**
    // `'star'`, picked in the old `<select>` that showed the label
    // ("K-pop / Estrela") never the drawing.
    //
    // Runs once. The `icon = 'star'` guard is not enough on its own: it also
    // matches an admin who *deliberately* picks the star for those two slugs in
    // the Categorias tab, and the next deploy would quietly undo her choice.
    const iconOneOff = await query(
      `INSERT INTO config (key, value)
       VALUES ('migration.030_category_icon_oneoff', 'true'::jsonb)
       ON CONFLICT (key) DO NOTHING
       RETURNING key`
    );
    if (iconOneOff.rows.length > 0) {
      await query(`UPDATE categories SET icon = 'heart' WHERE slug = 'beleza' AND icon = 'star'`);
      await query(`UPDATE categories SET icon = 'gift' WHERE slug = 'brinquedos' AND icon = 'star'`);
    }
    },
  },
  {
    name: "PIX on ticket reservation (migration 031)",
    run: async () => {
    await query(`ALTER TABLE event_reservations ADD COLUMN IF NOT EXISTS pix_txid VARCHAR(25)`);
    await query(
      `ALTER TABLE event_reservations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL`
    );
    await query(`CREATE INDEX IF NOT EXISTS idx_event_reservations_user ON event_reservations(user_id)`);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_event_reservations_email ON event_reservations(LOWER(buyer_email))`
    );
    },
  },
  {
    name: "Monthly club plan (migration 032)",
    run: async () => {
    await query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS members_payment_type_check`);
    await query(`ALTER TABLE members DROP CONSTRAINT IF EXISTS chk_members_payment_type`);
    await query(`ALTER TABLE members ALTER COLUMN payment_type SET DEFAULT 'monthly'`);
    await query(`DO $$ BEGIN
      ALTER TABLE members ADD CONSTRAINT chk_members_payment_type
        CHECK (payment_type IN ('monthly', 'annual'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await query(
      `UPDATE config SET value = '12.50'::jsonb
        WHERE key = 'pricing.club_annual' AND value = '149.99'::jsonb`
    );
    },
  },
  {
    name: "Subcategories + co-purchase index (migration 033)",
    run: async () => {
    // One level only: the nav drills parent → child and nothing draws a third
    // level, so a grandchild would be invisible rather than wrong. The depth
    // rule lives in the service — a CHECK cannot see the parent's own parent.
    await query(
      `ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE SET NULL`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id) WHERE parent_id IS NOT NULL`
    );
    await query(`DO $$ BEGIN
      ALTER TABLE categories ADD CONSTRAINT chk_categories_parent_not_self
        CHECK (parent_id IS NULL OR parent_id <> id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    // "Os clientes também compram" self-joins order_items on order_id; without
    // these the join scans every line the store ever sold.
    await query(
      `CREATE INDEX IF NOT EXISTS idx_order_items_order_product ON order_items(order_id, product_id)`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id) WHERE product_id IS NOT NULL`
    );
    },
  },
  {
    name: "Missing indexes from migrations 003/010 + hot report paths (migration 034)",
    run: async () => {
      // Three indexes were written in migrations but never ported to
      // `schema.sql` or to a step, so a fresh volume never got them.
      await query(
        `CREATE INDEX IF NOT EXISTS idx_subpayments_provider
           ON subscription_payments(provider_payment_id)`
      );
      await query(
        `CREATE INDEX IF NOT EXISTS idx_members_expiry_active
           ON members(expiry_date, status) WHERE status = 'active'`
      );
      await query(
        `CREATE INDEX IF NOT EXISTS idx_reviews_order ON product_reviews(order_id)`
      );

      // Every report filters on `COALESCE(paid_at, created_at)`, which no
      // plain column index can serve — the dashboard was doing a sequential
      // scan of `orders` eight times per load.
      await query(
        `CREATE INDEX IF NOT EXISTS idx_orders_settled_at
           ON orders ((COALESCE(paid_at, created_at)))`
      );

      // "Minhas compras" reads (user_id OR member_id) ORDER BY created_at.
      await query(
        `CREATE INDEX IF NOT EXISTS idx_orders_user_created
           ON orders(user_id, created_at DESC) WHERE user_id IS NOT NULL`
      );
      await query(
        `CREATE INDEX IF NOT EXISTS idx_orders_member_created
           ON orders(member_id, created_at DESC) WHERE member_id IS NOT NULL`
      );

      // The LGPD export matches on the address, and `email_logs` is the table
      // that grows fastest.
      await query(
        `CREATE INDEX IF NOT EXISTS idx_email_logs_recipient
           ON email_logs (lower(recipient))`
      );
      await query(
        `CREATE INDEX IF NOT EXISTS idx_audit_user_ts
           ON audit_logs(user_id, timestamp DESC) WHERE user_id IS NOT NULL`
      );
    },
  },
];

let state: SchemaState = {
  status: 'pending',
  ranAt: null,
  durationMs: 0,
  total: STEPS.length,
  failed: [],
};

/** State of the last run, surfaced in `GET /health`. */
export function getSchemaState(): SchemaState {
  return state;
}

export async function ensureSchema(): Promise<SchemaState> {
  const start = Date.now();
  const failed: SchemaStepFailure[] = [];

  for (const step of STEPS) {
    try {
      await step.run();
    } catch (err) {
      // A broken step does not cancel the others: they are independent in
      // practice, and aborting everything was the old silent-failure mode.
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ step: step.name, error: message });
      console.error(`[SCHEMA] ✗ step failed: ${step.name} — ${message}`);
    }
  }

  state = {
    status: failed.length ? 'degraded' : 'ok',
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    total: STEPS.length,
    failed,
  };

  if (failed.length) {
    console.error(
      `[SCHEMA] ⚠ ${failed.length} of ${STEPS.length} steps failed in ${state.durationMs}ms — ` +
        `schema is DEGRADED. Steps: ${failed.map((f) => f.step).join(' | ')}`
    );
  } else {
    console.log(`[SCHEMA] ✓ ${STEPS.length} steps in ${state.durationMs}ms`);
  }

  return state;
}
