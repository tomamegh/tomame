-- Seed pricing_groups and category_pricing_map from the existing JSON config.
-- This mirrors the data in src/config/pricing-categories.json and
-- the CATEGORY_TO_PRICING_GROUP map in src/config/pricing-categories.ts.

-- ── Pricing Groups ──────────────────────────────────────────────────────────

INSERT INTO pricing_groups (slug, name, flat_rate_ghs, flat_rate_expression, value_percentage, requires_weight, sort_order) VALUES
  ('phones',            'Phones',             1200, NULL,          0.05, false, 1),
  ('phone_accessories', 'Phone Accessories',   250, NULL,          0.04, false, 2),
  ('car_parts',         'Car Parts',          NULL, '5 + (w / 8)', 0.08, true,  3),
  ('gaming_consoles',   'Gaming Consoles',    1500, NULL,          0.06, false, 4),
  ('sound_speakers',    'Sound & Speakers',   NULL, '5 + (w / 8)', 0.07, false, 5)
ON CONFLICT (slug) DO NOTHING;

-- ── Category Mappings ───────────────────────────────────────────────────────
-- TomameCategory enum values (display strings) → pricing group slugs

INSERT INTO category_pricing_map (tomame_category, pricing_group_id)
SELECT cat.tomame_category, pg.id
FROM (VALUES
  ('Cell Phones & Accessories', 'phones'),
  ('Headphones',                'phone_accessories'),
  ('Wearable Technology',       'phone_accessories'),
  ('Automotive',                'car_parts'),
  ('Car Care',                  'car_parts'),
  ('Car Electronics & Accessories', 'car_parts'),
  ('Video Games',               'gaming_consoles'),
  ('Smart Home',                'sound_speakers')
) AS cat(tomame_category, group_slug)
JOIN pricing_groups pg ON pg.slug = cat.group_slug
ON CONFLICT (tomame_category) DO NOTHING;
