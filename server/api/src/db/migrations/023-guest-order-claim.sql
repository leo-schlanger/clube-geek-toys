-- 023 — Guest order claimed by an account created later
--
-- Guest checkout leaves `user_id IS NULL`, and `listMyOrders` filters by
-- `user_id` / `member_id`, so the order stayed orphaned even after the buyer
-- signed up with the same email.
--
-- Claiming happens in code (auth.service + order.service) and only for a
-- verified email: matching by email without proof of ownership would expose the
-- address and phone on someone else's order (LGPD).
--
-- The index serves that sweep on every verified login and every "Minhas
-- compras" load. Partial (the shrinking orphan slice) and on
-- `lower(customer_email)`: `users.email` is normalized, `orders.customer_email`
-- keeps whatever was typed at checkout.

CREATE INDEX IF NOT EXISTS idx_orders_guest_email
  ON orders (lower(customer_email))
  WHERE user_id IS NULL;
