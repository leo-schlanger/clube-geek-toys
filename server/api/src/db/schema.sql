-- Clube Geek & Toys - PostgreSQL Schema
-- Migrated from Firestore collections

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TABLES
-- ============================================

-- Users (replaces Firebase Auth + users collection)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'seller', 'admin', 'disabled')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,
  refresh_token_hash VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Members
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  cpf VARCHAR(11) NOT NULL UNIQUE,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(20),
  photo_url TEXT,
  plan VARCHAR(10) NOT NULL CHECK (plan IN ('silver', 'gold', 'black')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'inactive', 'expired')),
  payment_type VARCHAR(10) NOT NULL CHECK (payment_type IN ('monthly', 'annual')),
  start_date DATE,
  expiry_date DATE,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  pending_payment JSONB,
  subscription_id TEXT,
  subscription_status VARCHAR(20),
  auto_renewal BOOLEAN DEFAULT FALSE,
  activated_at TIMESTAMPTZ,
  activated_by_payment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  method VARCHAR(20) NOT NULL CHECK (method IN ('pix', 'credit_card', 'boleto', 'cash')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  provider_id TEXT,
  provider_status TEXT,
  reference TEXT,
  paid_at TIMESTAMPTZ,
  webhook_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Point Transactions
CREATE TABLE point_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('earn', 'redeem', 'expire', 'bonus')),
  points INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  description TEXT,
  purchase_value DECIMAL(10,2),
  expires_at DATE,
  expired BOOLEAN DEFAULT FALSE,
  is_promotion BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Subscriptions (ID = Mercado Pago preapproval_id)
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'paused', 'cancelled')),
  plan VARCHAR(10) NOT NULL,
  frequency_type VARCHAR(10) NOT NULL CHECK (frequency_type IN ('months', 'years')),
  transaction_amount DECIMAL(10,2) NOT NULL,
  next_payment_date TIMESTAMPTZ,
  last_payment_date TIMESTAMPTZ,
  failed_payments INTEGER NOT NULL DEFAULT 0,
  card_last_four VARCHAR(4),
  card_brand VARCHAR(50),
  payer_email VARCHAR(254),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ
);

-- Subscription Payments
CREATE TABLE subscription_payments (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_payment_id TEXT,
  failure_reason TEXT
);

-- Contracts
CREATE TABLE contracts (
  id TEXT PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  member_name VARCHAR(200) NOT NULL,
  member_cpf VARCHAR(11) NOT NULL,
  member_email VARCHAR(254) NOT NULL,
  plan VARCHAR(10) NOT NULL,
  signature_preview TEXT,
  signed_at TIMESTAMPTZ NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  document_hash VARCHAR(64),
  pdf_url TEXT,
  pdf_path TEXT,
  pdf_hash VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action VARCHAR(100) NOT NULL,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  details JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Email Logs
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  template VARCHAR(50) NOT NULL,
  recipient VARCHAR(254) NOT NULL,
  status VARCHAR(20) NOT NULL,
  resend_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Processed Webhooks (idempotency)
CREATE TABLE processed_webhooks (
  webhook_key TEXT PRIMARY KEY,
  type TEXT,
  action TEXT,
  data_id TEXT,
  request_id TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Error Logs (frontend + backend error tracking)
CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  severity VARCHAR(10) NOT NULL DEFAULT 'error' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'fatal')),
  message TEXT NOT NULL,
  stack TEXT,
  source VARCHAR(10) NOT NULL DEFAULT 'frontend' CHECK (source IN ('frontend', 'backend')),
  context JSONB DEFAULT '{}',
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  url TEXT,
  user_agent TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Config (key-value store)
CREATE TABLE config (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Consumed email verification tokens (one-time use enforcement)
-- Tracks token hashes that have been redeemed; cron cleans up rows older than 48h.
CREATE TABLE consumed_verification_tokens (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_consumed_tokens_consumed_at ON consumed_verification_tokens(consumed_at);

-- ============================================
-- INDEXES
-- ============================================

-- Members
CREATE INDEX idx_members_user_id ON members(user_id);
CREATE INDEX idx_members_cpf ON members(cpf);
CREATE INDEX idx_members_email ON members(email);
CREATE INDEX idx_members_status ON members(status);
CREATE INDEX idx_members_plan ON members(plan);
CREATE INDEX idx_members_expiry_date ON members(expiry_date);
CREATE INDEX idx_members_created_at ON members(created_at DESC);
CREATE INDEX idx_members_status_plan ON members(status, plan);

-- Payments
CREATE INDEX idx_payments_member_id ON payments(member_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_provider_id ON payments(provider_id);
CREATE INDEX idx_payments_member_created ON payments(member_id, created_at DESC);
CREATE INDEX idx_payments_status_paid ON payments(status, paid_at DESC);

-- Point Transactions
CREATE INDEX idx_points_member_id ON point_transactions(member_id);
CREATE INDEX idx_points_member_created ON point_transactions(member_id, created_at DESC);
CREATE INDEX idx_points_member_type ON point_transactions(member_id, type);
CREATE INDEX idx_points_expires ON point_transactions(expires_at) WHERE type = 'earn' AND expired = FALSE;

-- Subscriptions
CREATE INDEX idx_subscriptions_member_id ON subscriptions(member_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_member_status ON subscriptions(member_id, status);
CREATE INDEX idx_subscriptions_provider_id ON subscriptions(provider_id);

-- Subscription Payments
CREATE INDEX idx_subpayments_subscription ON subscription_payments(subscription_id);
CREATE INDEX idx_subpayments_member ON subscription_payments(member_id);
CREATE INDEX idx_subpayments_date ON subscription_payments(payment_date DESC);

-- Contracts
CREATE INDEX idx_contracts_member_id ON contracts(member_id);
CREATE INDEX idx_contracts_member_status ON contracts(member_id, status);
CREATE INDEX idx_contracts_member_created ON contracts(member_id, created_at DESC);

-- Audit Logs
CREATE INDEX idx_audit_member ON audit_logs(member_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, timestamp DESC);

-- Email Logs
CREATE INDEX idx_email_member ON email_logs(member_id);
CREATE INDEX idx_email_sent ON email_logs(sent_at DESC);

-- Error Logs
CREATE INDEX idx_error_created ON error_logs(created_at DESC);
CREATE INDEX idx_error_severity ON error_logs(severity, created_at DESC);
CREATE INDEX idx_error_source ON error_logs(source, created_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_members_updated_at
  BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_payments_updated_at
  BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
