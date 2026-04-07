-- Migration: Mercado Pago → PagBank
-- Rename provider-specific columns to generic names

-- Payments table
ALTER TABLE payments RENAME COLUMN mercadopago_id TO provider_id;
ALTER TABLE payments RENAME COLUMN mercadopago_status TO provider_status;
DROP INDEX IF EXISTS idx_payments_mercadopago_id;
CREATE INDEX idx_payments_provider_id ON payments(provider_id);

-- Subscriptions table
ALTER TABLE subscriptions RENAME COLUMN mercadopago_id TO provider_id;

-- Subscription Payments table
ALTER TABLE subscription_payments RENAME COLUMN mercadopago_payment_id TO provider_payment_id;

-- Update schema comments
COMMENT ON COLUMN payments.provider_id IS 'PagBank order/charge ID';
COMMENT ON COLUMN payments.provider_status IS 'PagBank status string';
COMMENT ON COLUMN subscriptions.provider_id IS 'PagBank subscription ID';
COMMENT ON COLUMN subscription_payments.provider_payment_id IS 'PagBank charge ID';
