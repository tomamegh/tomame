-- 097: who to call about a sourcing request.
--
-- A buyer working the sourcing queue (065) had a product link and nothing else:
-- no name to ask for and no number to ring when the item came in two colours or
-- the store wanted a different size. The customer now confirms both when they
-- raise the request, prefilled from their profile and correctable there and
-- then, and the row keeps what they confirmed — not a pointer to the profile,
-- which they may change or empty later.
--
-- NULLABLE because rows raised before this migration have neither. New
-- requests always carry both (zod in the route, the form, and the CHECKs below).
--
-- The phone is stored in ONE form: E.164 `+233XXXXXXXXX`, produced by
-- `normaliseGhanaPhone` (src/features/order-delivery/schema.ts) — the same rule
-- and the same CHECK shape as 075's `order_deliveries.courier_phone`, so a
-- write that skips the app still cannot store a number nobody can dial.
--
-- RLS: no new policy is needed. 041's owner read and 065's admin read already
-- cover every column of `price_watches`, and 061 removed the API roles' write
-- grants (the app writes watches through the service role only).

ALTER TABLE price_watches
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

ALTER TABLE price_watches DROP CONSTRAINT IF EXISTS price_watches_contact_name_len;
ALTER TABLE price_watches
  ADD CONSTRAINT price_watches_contact_name_len
  CHECK (contact_name IS NULL OR char_length(btrim(contact_name)) BETWEEN 1 AND 120);

ALTER TABLE price_watches DROP CONSTRAINT IF EXISTS price_watches_contact_phone_e164;
ALTER TABLE price_watches
  ADD CONSTRAINT price_watches_contact_phone_e164
  CHECK (contact_phone IS NULL OR contact_phone ~ '^\+233[1-9][0-9]{8}$');

COMMENT ON COLUMN price_watches.contact_name IS
  'Sourcing rows: the name the customer confirmed when raising the request (097).';
COMMENT ON COLUMN price_watches.contact_phone IS
  'Sourcing rows: the customer''s phone as E.164 +233XXXXXXXXX (097).';
