-- Migration 056: the marketing copy loses its em dashes too.
--
-- Kelvin: "The amount of em dashes in the entire application text is too much.
-- Polish and remove them."
--
-- The code sweep could not reach this. Most of the landing page, the FAQ, the
-- testimonials and the comparison table are ROWS, not source: `site_content`
-- (036-038) exists so an admin can change that copy without a deploy. So after
-- the code was clean the home page still rendered eleven of them, and they were
-- the most visible ones on the site.
--
-- WHY A MIGRATION AND NOT A ONE-OFF UPDATE. This copy is admin-editable, so the
-- change has to reach dev and production the same way every other content change
-- does, and be reviewable in the diff rather than typed into a SQL console once
-- and forgotten. It is written as a guarded UPDATE, matching how 048 moved
-- `site_settings.whatsapp_number` off its placeholder.
--
-- IDEMPOTENT AND NON-DESTRUCTIVE. Every statement matches on the OLD text, so
-- re-running changes nothing, and a row an admin has since rewritten by hand is
-- left alone rather than stamped back to a version this file happens to hold.
-- That is the important property: `site_content` is a table people edit.

BEGIN;

-- ── Landing: the three feature cards and the process step ───────────────────

UPDATE site_content SET body =
  'Item, tax, our fee, freight, today''s rate: printed on every product, locked for 24 hours. What you see is what you pay.'
WHERE slug = 'landed-price-upfront' AND body LIKE '%today''s rate —%';

UPDATE site_content SET body =
  'Everything you purchase in a week flies together. Fill the box and the freight per item drops, and we show you the saving as you shop.'
WHERE slug = 'one-box-less-freight' AND body LIKE '%per item drops —%';

UPDATE site_content SET body =
  'Bookmark anything. We re-check the store daily and ping you on WhatsApp when it drops, in cedis, landed.'
WHERE slug = 'price-watch' AND body LIKE '%when it drops —%';

UPDATE site_content SET body =
  'Item, tax, our fee, freight and today''s rate, itemised in GH₵ and locked for 24 hours.'
WHERE slug = 'see-landed-price' AND body LIKE '%today''s rate —%';

-- ── The FAQ ─────────────────────────────────────────────────────────────────

UPDATE site_content SET body =
  'Your money is held until we have actually purchased the item. If the seller is out of stock, refuses the order or looks unsafe, we refund you in full the same day, fees included.'
WHERE slug = 'cannot-source' AND body LIKE '%in full —%';

UPDATE site_content SET body =
  'Two to four weeks from link to door in most cases. Boxes fly weekly out of our US hub, and a rider brings yours the day it clears in Accra, or you collect it at our Osu hub.'
WHERE slug = 'how-long' AND body LIKE '%in Accra —%';

UPDATE site_content SET body =
  'Item price, the store''s sales tax, our fee, freight by weight, and today''s exchange rate: each on its own line before you pay. The quote is locked for 24 hours, and nothing is added afterwards.'
WHERE slug = 'how-price-works' AND body LIKE '%exchange rate —%';

UPDATE site_content SET body =
  'No minimum. One lipstick or ten laptops get the same itemised quote and the same fee structure. Freight has a minimum chargeable weight, which the quote always shows.'
WHERE slug = 'minimum-order' AND body LIKE '%ten laptops —%';

UPDATE site_content SET body =
  'Right now, any store that ships within the USA: Amazon, eBay, Apple, Walmart, Best Buy and 100+ more. If we can''t read a page automatically, our team quotes it by hand within a few hours. UK and China lanes are coming soon.'
WHERE slug = 'which-stores' AND body LIKE '%within the USA —%';

-- ── The about page ──────────────────────────────────────────────────────────

UPDATE site_content SET body =
  'Tomame began in 2023 in Accra, when three friends got tired of begging cousins overseas to post things home. Today a small team buys, ships and delivers for thousands of Ghanaians, with the price agreed before a cedi moves.'
WHERE slug = 'about-story' AND body LIKE '%Ghanaians —%';

-- ── Testimonials: the role line lives in `data` ─────────────────────────────
-- A comma is right here. "Founder, Kente Boutique, Accra" is the ordinary way a
-- person's title and city are written on a card.

UPDATE site_content SET data = jsonb_set(data, '{role}', '"Founder, Kente Boutique, Accra"')
WHERE slug = 'kwame-asante' AND data->>'role' LIKE '%—%';

UPDATE site_content SET data = jsonb_set(data, '{role}', '"Owner, GoldCoast Trends, Kumasi"')
WHERE slug = 'kofi-boateng' AND data->>'role' LIKE '%—%';

-- ── The comparison table ────────────────────────────────────────────────────
-- A table cell, so it stays short. The dash was doing the work of a colon.

UPDATE site_content SET data = jsonb_set(data, '{forwarder}', '"No: card FX + forwarder fee later"')
WHERE slug = 'total-before-paying' AND data->>'forwarder' LIKE '%—%';

-- ── The lane cards ──────────────────────────────────────────────────────────
-- `regions.blurb` is the copy on the "where we buy" cards.

UPDATE regions SET blurb =
  'Opening next. Direct cargo from London means a shorter flight, fashion first. Join the waitlist to hear when it opens.'
WHERE code = 'UK' AND blurb LIKE '%shorter flight —%';

-- NOT TOUCHED, deliberately: the em dashes left in `site_settings` are inside
-- the `description` column of `fees_worked_example` and `payment_channels`,
-- which documents the setting for whoever edits it in the admin console. That is
-- developer prose, the same category as a code comment, and no customer reads it.

COMMIT;
