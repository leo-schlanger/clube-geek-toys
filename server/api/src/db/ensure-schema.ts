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

    // ─── Missing indexes for reports and LGPD queries ────────────────────────
    await query(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status_created
        ON subscriptions(status, created_at DESC)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_audit_user_id
        ON audit_logs(user_id)
    `);

    // ─── CHECK constraints for enum columns ────────────────────────
    await query(`DO $$ BEGIN
      ALTER TABLE members ADD CONSTRAINT chk_members_plan CHECK (plan IN ('silver','gold','black'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
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

    console.log(`[SCHEMA] ensureSchema completed in ${Date.now() - start}ms`);
  } catch (err) {
    // Loud-fail but don't crash the API. The operator should investigate via logs.
    console.error('[SCHEMA] ⚠ ensureSchema failed — some features may be degraded:', err);
  }
}
