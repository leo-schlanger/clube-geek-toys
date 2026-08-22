-- 026 — Customer note to the shop at checkout
--
-- Free text and deliberately short: it is a note, not an address or a delivery
-- instruction, and nothing in the system branches on it. The 500-char limit is
-- also in the route's Zod schema; this constraint is the backstop for writes
-- that bypass the API.
--
-- Personal data like any customer-written content: included in the LGPD export
-- and redacted on deletion.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_note TEXT;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT chk_orders_customer_note_len
    CHECK (customer_note IS NULL OR length(customer_note) <= 500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
