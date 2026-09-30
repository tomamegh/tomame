-- Migration 070: delivery is 5–7 days and pickup is at Weija, both read from
-- admin-editable data instead of being typed into the copy.
--
-- Kelvin: "On the marketing site and throughout the application ensure that
-- the delivery time is 5 to 7 days. No reference of 14 days or a longer
-- period." And: "put it in the Content section so we can change it each time."
--
-- The delivery time now lives in ONE place: `regions.transit_days_min/max` of
-- the live lane (Admin → Content → Lanes). The quote's ETA dates already read
-- those columns; the copy did not — it said "2–4 weeks", "16 days" and "3 to 6
-- weeks" in six different rows. Each of those rows now carries the token
-- `{delivery_window}`, which the marketing service fills with the region's
-- window at render time (src/features/marketing/content-tokens.ts). Change the
-- region's days and every sentence follows.
--
-- Same shape as 056: guarded UPDATEs that match on the OLD text, so re-running
-- changes nothing and a row an admin has since rewritten is left alone. No
-- deletes.

BEGIN;

-- ── The live lane: 5–7 days door to door ─────────────────────────────────────
-- 037 seeded 14–18. Production was already edited to 5–7 by hand; this brings a
-- fresh environment to the same place without touching a hand-edited value.
UPDATE regions SET transit_days_min = 5, transit_days_max = 7, updated_at = now()
WHERE code = 'USA' AND transit_days_min = 14 AND transit_days_max = 18;

-- ── site_content: the number becomes the token ──────────────────────────────

UPDATE site_content SET
  body = 'Store → our US hub → Accra → you. WhatsApp updates at each hop. Typically {delivery_window}.',
  updated_at = now()
WHERE kind = 'process_step' AND slug = 'track-to-your-door' AND body LIKE '%2–4 weeks%';

UPDATE site_content SET
  body = '{delivery_window} from payment to your door in most cases. Boxes fly out of our US hub by air, and a rider brings yours the day it clears in Accra, or you collect it at {pickup_point}.',
  updated_at = now()
WHERE kind = 'faq' AND slug = 'how-long' AND body LIKE 'Two to four weeks%';

UPDATE site_content SET
  title = '{delivery_window}',
  body = 'from payment to your door',
  updated_at = now()
WHERE kind = 'stat' AND slug = 'average-transit' AND title = '16 days';

-- The slug stays: it is an identifier, and renaming it would orphan nothing but
-- would break any admin bookmark. Only the words change.
UPDATE site_content SET
  title = '{delivery_window} to your door',
  updated_at = now()
WHERE kind = 'trust_chip' AND slug = 'two-to-four-weeks' AND title LIKE '2–4 weeks%';

-- The competitor column no longer states a long period either (no reference of
-- 14 days or longer anywhere); it says what is true without a number.
UPDATE site_content SET
  data = data || jsonb_build_object('tomame', '{delivery_window}', 'forwarder', 'Slower, and it varies'),
  updated_at = now()
WHERE kind = 'compare_row' AND slug = 'typical-time' AND data->>'tomame' = '2–4 weeks';

-- ── Pickup is at Weija, not Osu ─────────────────────────────────────────────
-- Kelvin: the pickup point in Ghana is Weija. The place is now named once, in
-- `site_settings.pickup_point`, and copy says `{pickup_point}`. The pickup
-- zone's own name (checkout, "Where we buy") is renamed here and is editable
-- in Admin → Content → Delivery zones from this release.

INSERT INTO site_settings (key, value, label, description, is_public) VALUES
  ('pickup_point', '"our Weija hub"'::jsonb,
   'Pickup point',
   'Where customers collect a box themselves, as it reads mid-sentence (“or free pickup at our Weija hub”). Copy blocks print it wherever they say {pickup_point}. Rename the pickup delivery zone to match.',
   true)
ON CONFLICT (key) DO NOTHING;

UPDATE delivery_zones SET name = 'Pickup at our Weija hub', updated_at = now()
WHERE kind = 'pickup' AND name = 'Pickup at our Osu hub';

UPDATE site_content SET
  body = replace(body, 'our Osu hub', '{pickup_point}'),
  updated_at = now()
WHERE body LIKE '%our Osu hub%';

-- ── Shipping methods: content, not policy prose ─────────────────────────────
-- Kelvin: "sea freight and other stuff like that can be in the content side."
-- Each method is a `shipping_method` block: title = name, body = availability
-- note, data.window = the delivery window (a text cell the blocks panel edits),
-- is_published = whether customers see it. The shipping policy prints the
-- published ones through `{shipping_methods}`.
--
-- Tomame flies every box today, so air is published with the region's window.
-- Sea freight is seeded UNPUBLISHED with no window: nothing on the site states
-- a long delivery time until an admin sets one and switches it on.

ALTER TABLE site_content DROP CONSTRAINT IF EXISTS site_content_kind_check;

ALTER TABLE site_content ADD CONSTRAINT site_content_kind_check CHECK (kind IN (
  'faq', 'testimonial', 'process_step', 'value_prop', 'feature_card',
  'fee_line', 'compare_row', 'stat', 'trust_chip', 'hero_copy', 'store',
  'quote_assurance', 'shipping_method'
));

INSERT INTO site_content (kind, slug, locale, title, body, data, sort_order, is_published) VALUES
  ('shipping_method', 'air-freight', 'en', 'Air freight',
   'Every order flies this way.',
   '{"window": "{delivery_window} from payment to your door"}'::jsonb, 1, true),
  ('shipping_method', 'sea-freight', 'en', 'Sea freight',
   'On request, for heavy or bulky items.',
   '{"window": ""}'::jsonb, 2, false)
ON CONFLICT (kind, slug, locale) DO NOTHING;

-- ── policies.shipping: the two hardcoded tiers become the content list ──────
-- The old text offered 3–6 week sea freight as the standard and 7–14 day air
-- as a paid express. Neither matched the product: every box flies.
-- Matched by pattern, not exact text: environments differ in the separator
-- (":" on production, " — " on older seeds), and only these two lines change.
UPDATE policies SET
  content = regexp_replace(
    regexp_replace(content, '- \*\*Standard \(Sea freight\)\*\*[^\n]*\n', ''),
    '- \*\*Express \(Air freight\)\*\*[^\n]*',
    '{shipping_methods}'
  ),
  last_updated = now()
WHERE slug = 'shipping'
  AND content ~ '- \*\*Standard \(Sea freight\)\*\*[^\n]*3 to 6 weeks'
  AND content ~ '- \*\*Express \(Air freight\)\*\*[^\n]*7 to 14 days';

COMMIT;
