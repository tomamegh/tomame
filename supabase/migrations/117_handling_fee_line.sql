-- 117: the handling fee is charged openly, as its own line (site brief, Fix 7).
--
-- Admin pricing described handling_fee_usd ($3) as a "Fixed handling fee per
-- order" that nothing visibly charged. In fact the calculator adds it to freight
-- once per product line on weight-priced items, and it sat unseen inside the
-- "Freight" row. Kelvin chose to charge it openly: every customer breakdown
-- (quote, bag, order page, emails, worked example) now shows a "Handling fee"
-- line, and the description below says exactly what is charged. No price
-- changes.

BEGIN;

UPDATE pricing_constants
   SET description = 'Per product line, on weight-priced items only (USD). Shown to the customer as its own "Handling fee" line on every breakdown; flat-rate and fixed-freight items carry none.'
 WHERE key = 'handling_fee_usd';

COMMIT;
