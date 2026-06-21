-- Expand pricing groups to cover all TomameCategory values.
-- Adds new groups for uncovered categories and maps all 97 categories.
-- Existing groups (phones, phone_accessories, car_parts, gaming_consoles, sound_speakers) are unchanged.
-- Existing mappings are preserved via ON CONFLICT DO NOTHING.
--
-- Pricing rationale:
--   flat_rate_ghs = estimated shipping cost to Ghana for typical items in this group
--   value_percentage = service fee as fraction (e.g. 0.05 = 5%)
--   Items under $100 get a higher % (covers minimum handling), items over get lower %

-- ── New Pricing Groups ──────────────────────────────────────────────────────

INSERT INTO pricing_groups (slug, name, flat_rate_ghs, flat_rate_expression, value_percentage, value_percentage_high, value_threshold_usd, default_weight_lbs, requires_weight, sort_order) VALUES
  -- Electronics & Computers
  ('electronics_general', 'Electronics (General)',     1000, NULL, 0.06, 0.04, 100, NULL,  false, 10),
  ('computers',           'Computers & Laptops',       1500, NULL, 0.06, 0.04, 100, NULL,  false, 11),
  ('tv_video',            'TV & Video',                NULL, '8 + (w / 6)', 0.06, 0.04, 100, 15, false, 12),
  ('cameras',             'Camera & Photo',             800, NULL, 0.06, 0.04, 100, NULL,  false, 13),

  -- Home & Garden
  ('home_kitchen',        'Home & Kitchen',             NULL, '5 + (w / 6)', 0.06, 0.04, 100, 5, false, 20),
  ('furniture',           'Furniture',                  NULL, '10 + (w / 5)', 0.08, 0.05, 100, NULL, true, 21),
  ('appliances',          'Appliances',                 NULL, '8 + (w / 5)', 0.07, 0.05, 100, NULL, true, 22),
  ('garden_outdoor',      'Garden & Outdoor',           NULL, '6 + (w / 6)', 0.06, 0.04, 100, 8, false, 23),
  ('tools',               'Tools & Home Improvement',   NULL, '5 + (w / 6)', 0.06, 0.04, 100, 5, false, 24),

  -- Fashion & Clothing
  ('fashion_light',       'Fashion (Light)',             400, NULL, 0.08, 0.05, 100, NULL,  false, 30),
  ('fashion_shoes',       'Shoes & Footwear',            500, NULL, 0.08, 0.05, 100, NULL,  false, 31),
  ('fashion_accessories', 'Fashion Accessories',         350, NULL, 0.08, 0.05, 100, NULL,  false, 32),
  ('luggage',             'Luggage & Travel',            NULL, '6 + (w / 6)', 0.07, 0.05, 100, 8, false, 33),

  -- Beauty & Personal Care
  ('beauty',              'Beauty & Personal Care',      350, NULL, 0.07, 0.05, 100, NULL,  false, 40),

  -- Health & Wellness
  ('health',              'Health & Wellness',           400, NULL, 0.07, 0.05, 100, NULL,  false, 50),

  -- Sports & Outdoors
  ('sports',              'Sports & Outdoors',           NULL, '5 + (w / 6)', 0.06, 0.04, 100, 5, false, 60),

  -- Baby & Kids
  ('baby_kids',           'Baby & Kids',                 500, NULL, 0.07, 0.05, 100, NULL,  false, 70),

  -- Books & Media
  ('books_media',         'Books & Media',               300, NULL, 0.06, 0.04, 100, NULL,  false, 80),
  ('musical_instruments', 'Musical Instruments',         NULL, '6 + (w / 6)', 0.07, 0.05, 100, 5, false, 81),

  -- Office & School
  ('office',              'Office & School',             400, NULL, 0.06, 0.04, 100, NULL,  false, 90),

  -- Pet Supplies
  ('pets',                'Pet Supplies',                400, NULL, 0.06, 0.04, 100, NULL,  false, 100),

  -- Arts & Crafts
  ('crafts',              'Arts & Crafts',               350, NULL, 0.06, 0.04, 100, NULL,  false, 110),

  -- Collectibles
  ('collectibles',        'Collectibles & Fine Art',     500, NULL, 0.08, 0.05, 100, NULL,  false, 120),

  -- Catch-all
  ('other',               'Other',                       NULL, '5 + (w / 6)', 0.07, 0.05, 100, 5, false, 999)
ON CONFLICT (slug) DO NOTHING;

-- ── Category Mappings ───────────────────────────────────────────────────────
-- Maps all TomameCategory enum values to pricing groups.
-- Existing mappings (from migration 030) are preserved via ON CONFLICT DO NOTHING.

INSERT INTO category_pricing_map (tomame_category, pricing_group_id)
SELECT cat.tomame_category, pg.id
FROM (VALUES
  -- Electronics & Computers
  ('Electronics',                    'electronics_general'),
  ('Computers',                      'computers'),
  ('Cell Phones & Accessories',      'phones'),
  ('TV & Video',                     'tv_video'),
  ('Camera & Photo',                 'cameras'),
  ('Headphones',                     'phone_accessories'),
  ('Video Games',                    'gaming_consoles'),
  ('Wearable Technology',            'phone_accessories'),
  ('Smart Home',                     'sound_speakers'),

  -- Home & Garden
  ('Home & Kitchen',                 'home_kitchen'),
  ('Furniture',                      'furniture'),
  ('Kitchen & Dining',               'home_kitchen'),
  ('Bedding',                        'home_kitchen'),
  ('Bath',                           'home_kitchen'),
  ('Garden & Outdoor',               'garden_outdoor'),
  ('Appliances',                     'appliances'),
  ('Home Improvement',               'tools'),
  ('Tools & Home Improvement',       'tools'),
  ('Lighting & Ceiling Fans',        'home_kitchen'),

  -- Fashion & Clothing
  ('Women''s Clothing',              'fashion_light'),
  ('Men''s Clothing',                'fashion_light'),
  ('Kids'' Clothing',                'fashion_light'),
  ('Women''s Shoes',                 'fashion_shoes'),
  ('Men''s Shoes',                   'fashion_shoes'),
  ('Kids'' Shoes',                   'fashion_shoes'),
  ('Jewelry',                        'fashion_accessories'),
  ('Watches',                        'fashion_accessories'),
  ('Handbags & Wallets',             'fashion_accessories'),
  ('Luggage & Travel Gear',          'luggage'),
  ('Fashion Accessories',            'fashion_accessories'),

  -- Beauty & Personal Care
  ('Beauty & Personal Care',         'beauty'),
  ('Skin Care',                      'beauty'),
  ('Makeup',                         'beauty'),
  ('Hair Care',                      'beauty'),
  ('Fragrance',                      'beauty'),
  ('Personal Care',                  'beauty'),

  -- Health & Wellness
  ('Health & Household',             'health'),
  ('Vitamins & Dietary Supplements', 'health'),
  ('Medical Supplies & Equipment',   'health'),
  ('Wellness & Relaxation',          'health'),

  -- Sports & Outdoors
  ('Sports & Outdoors',              'sports'),
  ('Exercise & Fitness',             'sports'),
  ('Outdoor Recreation',             'sports'),
  ('Sports Fan Shop',                'sports'),
  ('Cycling',                        'sports'),

  -- Baby & Kids
  ('Baby',                           'baby_kids'),
  ('Toys & Games',                   'baby_kids'),
  ('Kids'' Fashion',                 'baby_kids'),

  -- Automotive (already mapped to car_parts in 030)
  ('Automotive',                     'car_parts'),
  ('Car Care',                       'car_parts'),
  ('Car Electronics & Accessories',  'car_parts'),

  -- Books & Media
  ('Books',                          'books_media'),
  ('Music',                          'books_media'),
  ('Movies & TV',                    'books_media'),
  ('Musical Instruments',            'musical_instruments'),

  -- Office & School
  ('Office Products',                'office'),
  ('Office Electronics',             'office'),
  ('School Supplies',                'office'),
  ('Office Furniture',               'furniture'),

  -- Pet Supplies
  ('Pet Supplies',                   'pets'),

  -- Arts & Crafts
  ('Arts, Crafts & Sewing',         'crafts'),
  ('Craft Supplies',                 'crafts'),
  ('Fabric',                         'crafts'),

  -- Collectibles
  ('Collectibles & Fine Art',        'collectibles'),
  ('Antiques',                       'collectibles'),
  ('Sports Collectibles',            'collectibles'),

  -- Other
  ('Other',                          'other')
) AS cat(tomame_category, group_slug)
JOIN pricing_groups pg ON pg.slug = cat.group_slug
ON CONFLICT (tomame_category) DO NOTHING;
