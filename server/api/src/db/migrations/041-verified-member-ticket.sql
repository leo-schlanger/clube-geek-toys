-- 041 — Member half-price is a checked membership
--
-- `kind = member` used to be whatever the form said. `member_id` is the member
-- the server checked. The partial unique index is one discount per member per
-- event, including two requests at the same time. A cancelled ticket leaves
-- the index, so a voided purchase does not keep the discount.

ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES members(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_tickets_one_member_discount
  ON event_tickets (event_id, member_id)
  WHERE member_id IS NOT NULL AND status <> 'cancelled';
