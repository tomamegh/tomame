-- Migration 037: seed marketing content from the redesign mocks.
--
-- IMPORTANT: figures are NOT seeded as text. Any row that displays a number carries
-- data->>'value_source', naming the live value the renderer must resolve from the
-- pricing engine (pricing_constants / pricing_groups / exchange_rates). The mock's
-- "5%", "8%" and "+4%" were sample copy; the real values are admin-controlled.

-- ── Consolidation saving: admin-set percentage driving the freight box ────────
INSERT INTO pricing_constants (key, value, label, description, unit) VALUES
  ('consolidation_saving_pct', 0.20, 'Consolidation Saving',
   'Share of per-item freight saved when items ship together in one box. Drives the freight-box saving shown in the bag.', '%'),
  ('box_capacity_lbs', 9.00, 'Box Capacity',
   'Chargeable weight one consolidation box holds. Drives the freight-box fill percentage.', 'lb')
ON CONFLICT (key) DO NOTHING;

-- ── Regions ───────────────────────────────────────────────────────────────────
INSERT INTO regions (code, name, status, hub_city, transit_days_min, transit_days_max, store_names, tag_names, blurb, photo_key, sort_order) VALUES
  ('USA', 'United States', 'live', 'New York', 14, 18,
   ARRAY['Amazon','eBay','Apple','Walmart','Best Buy','SHEIN US'],
   ARRAY['Electronics','Sneakers','Beauty','Books'],
   'Our only lane for now, and a well-worn one. Weekly consolidated air freight out of New York; electronics and sneakers are most of what flies.',
   'mk-region-us', 1),
  ('UK', 'United Kingdom', 'soon', 'London', NULL, NULL,
   ARRAY['ASOS','Amazon UK','Zara','Boots'],
   ARRAY['Fashion','Skincare','Baby','Homeware'],
   'Opening next. Direct cargo from London means a shorter flight — fashion first. Join the waitlist to hear when it opens.',
   'mk-region-uk', 2),
  ('CHINA', 'China', 'soon', 'Guangzhou', NULL, NULL,
   ARRAY['Alibaba','AliExpress','Temu'],
   ARRAY['Bulk','Fabric','Gadgets','Hair'],
   'On the roadmap. Cheapest per pound for bulk orders and small-business stock. Waitlist open.',
   'mk-region-cn', 3)
ON CONFLICT (code) DO NOTHING;

-- ── Delivery zones ────────────────────────────────────────────────────────────
INSERT INTO delivery_zones (name, kind, fee_ghs, extra_days, note, sort_order) VALUES
  ('Greater Accra · door delivery', 'door',   0, 0, 'same or next day after landing', 1),
  ('Kumasi',                        'door',  40, 2, NULL, 2),
  ('Takoradi',                      'door',  40, 2, NULL, 3),
  ('Cape Coast · Tamale · Ho',      'door',  55, 3, NULL, 4),
  ('Pickup at our Osu hub',         'pickup', 0, 0, 'any time after landing', 5)
ON CONFLICT DO NOTHING;

-- ── Site settings ─────────────────────────────────────────────────────────────
INSERT INTO site_settings (key, value, label, description, is_public) VALUES
  ('whatsapp_number', '"+233 59 442 4746"'::jsonb, 'WhatsApp number', 'Shown in the marketing footer and support prompts.', true),
  ('support_hours',   '"8am–10pm"'::jsonb,          'Support hours',   'Displayed beside the WhatsApp number.', true),
  ('company_address', '"Accra, Ghana"'::jsonb,      'Company address', 'Footer copyright line.', true),
  ('payment_channels', '["MTN MoMo","Telecel Cash","AT Money","Visa","Mastercard"]'::jsonb,
   'Payment channels', 'Channels listed in the footer. Collected by Paystack at checkout.', true),
  -- INPUT ONLY. The Fees page runs this through the live pricing engine; the
  -- resulting figures are never stored, so the worked example cannot go stale.
  ('fees_worked_example',
   '{"subject":"Oraimo BoomPop N headset from the US","product_title":"Oraimo BoomPop N Wireless Headphones, Black","product_image_key":"oraimo-boompop-n","category":"Headphones","item_price_usd":49.99,"quantity":1,"weight_lbs":0.6,"region":"usa","price_presets_usd":[50,298,1200]}'::jsonb,
   'Fees worked example',
   'INPUT ONLY for the Fees worked example and the landing hero receipt — priced live by calculatePricing, so the figures can never go stale. Shape must match workedExampleInputSchema in src/features/marketing/schema.ts. Set item_price_usd to the real retail price.', true)
ON CONFLICT (key) DO NOTHING;

-- ── Process steps ─────────────────────────────────────────────────────────────
INSERT INTO site_content (kind, slug, title, body, data, sort_order) VALUES
  ('process_step', 'paste-a-link', 'Paste a link',
   'Any Amazon, eBay, Walmart or Best Buy product page. We read the title, photos, price and weight in seconds.',
   '{"n":"01","icon":"LinkSimple"}', 1),
  ('process_step', 'see-landed-price', 'See the landed price',
   'Item, tax, our fee, freight and today''s rate — itemised in GH₵ and locked for 24 hours.',
   '{"n":"02","icon":"Receipt"}', 2),
  ('process_step', 'pay-momo-or-card', 'Pay with MoMo or card',
   'Paystack holds it until we''ve purchased your item. Can''t source it? Full refund, same day.',
   '{"n":"03","icon":"DeviceMobile"}', 3),
  ('process_step', 'track-to-your-door', 'Track it to your door',
   'Store → our US hub → Accra → you. WhatsApp updates at each hop. Typically 2–4 weeks.',
   '{"n":"04","icon":"HouseLine"}', 4)
ON CONFLICT (kind, slug, locale) DO NOTHING;

-- ── Fee lines. `value_source` names the live figure to resolve. ───────────────
INSERT INTO site_content (kind, slug, title, body, data, sort_order) VALUES
  ('fee_line', 'tomame-fee', 'Tomame fee',
   'Our only charge. Covers buying, checking the seller, receiving and repacking.',
   '{"icon":"HandHeart","value_source":"value_fee_pct","accent":true}', 1),
  ('fee_line', 'store-sales-tax', 'Store sales tax',
   'Charged by the store at checkout. Varies by US state; some states charge none.',
   '{"icon":"Bank","value_source":"tax_pct_usa"}', 2),
  ('fee_line', 'freight', 'Freight',
   'By weight, with a minimum chargeable weight. Boxes consolidate, so freight per item falls as you add.',
   '{"icon":"AirplaneTilt","value_source":"freight_rate_per_lb"}', 3),
  ('fee_line', 'exchange-rate', 'Exchange rate',
   'Mid-market plus a buffer, locked for 24 hours from your quote. Always printed on the receipt.',
   '{"icon":"ArrowsLeftRight","value_source":"fx_buffer_pct"}', 4),
  ('fee_line', 'door-delivery', 'Door delivery',
   'Free in Greater Accra. A flat fee elsewhere, or free pickup at our Osu hub.',
   '{"icon":"Truck","value_source":"delivery_from_ghs","positive":true}', 5)
ON CONFLICT (kind, slug, locale) DO NOTHING;

-- ── Landing feature cards ────────────────────────────────────────────────────
-- "Three things only a personal shopper can do". Distinct from `value_prop`,
-- which is the About page's Transparency/Speed/Trust. Copy is the mock's.
-- `variant` selects the visual: the receipt inset, the fill-able freight box,
-- the price-watch teaser, the buyer photo.
INSERT INTO site_content (kind, slug, title, body, data, sort_order) VALUES
  ('feature_card', 'landed-price-upfront', 'The landed price, upfront',
   'Item, tax, our fee, freight, today''s rate — printed on every product, locked for 24 hours. What you see is what you pay.',
   '{"variant":"receipt","icon":"Receipt","cta_label":"See how fees work","cta_href":"/fees","delay":"0.1s"}', 1),
  ('feature_card', 'one-box-less-freight', 'One box, less freight',
   'Everything you purchase in a week flies together. Fill the box and the freight per item drops — we show you the saving as you shop.',
   '{"variant":"freight_box","icon":"Package","delay":"0.18s","example_weight_lbs":5.6}', 2),
  ('feature_card', 'price-watch', 'Price watch',
   'Bookmark anything. We re-check the store daily and ping you on WhatsApp when it drops — in cedis, landed.',
   '{"variant":"price_watch","icon":"BookmarkSimple","delay":"0.26s","example_product":"MacBook Air 13\" M3","example_drop_usd":150,"example_price_usd":849}', 3),
  ('feature_card', 'buyer-you-can-talk-to', 'A buyer you can talk to',
   'Wrong size? Sketchy seller? Ask on WhatsApp before we buy. A real person in Accra answers.',
   '{"variant":"buyer","icon":"ChatCircleDots","photo_key":"mk-buyer-photo","delay":"0.34s"}', 4)
ON CONFLICT (kind, slug, locale) DO NOTHING;

-- ── Value props ───────────────────────────────────────────────────────────────
INSERT INTO site_content (kind, slug, title, body, data, sort_order) VALUES
  ('value_prop', 'transparency', 'Transparency',
   'Every fee explained before you pay. If it isn''t on the receipt, you don''t owe it.', '{"icon":"Eye"}', 1),
  ('value_prop', 'speed', 'Speed',
   'Instant quotes, weekly flights, riders the day it lands. We don''t make you wait to know.', '{"icon":"Lightning"}', 2),
  ('value_prop', 'trust', 'Trust',
   'Your money is held until we''ve purchased your item. Can''t source it? Refunded in full.', '{"icon":"ShieldCheck"}', 3)
ON CONFLICT (kind, slug, locale) DO NOTHING;

-- ── Testimonials ──────────────────────────────────────────────────────────────
INSERT INTO site_content (kind, slug, title, body, data, sort_order) VALUES
  ('testimonial', 'kwame-asante', 'Kwame Asante',
   'I paste a link, pay with Mobile Money, and it arrives. No forex stress, no surprises.',
   '{"role":"Founder, Kente Boutique — Accra","initials":"KA","rating":5}', 1),
  ('testimonial', 'abena-mensah', 'Abena Mensah',
   'I used to spend hours trying to buy from Amazon. Now it''s minutes, in cedis. The WhatsApp tracking is a bonus.',
   '{"role":"CEO, Accra Imports Ltd.","initials":"AM","rating":5}', 2),
  ('testimonial', 'kofi-boateng', 'Kofi Boateng',
   'The breakdown is incredibly honest. I see exactly what I''m paying before I confirm. That trust is everything.',
   '{"role":"Owner, GoldCoast Trends — Kumasi","initials":"KB","rating":5}', 3)
ON CONFLICT (kind, slug, locale) DO NOTHING;

-- ── Comparison table ──────────────────────────────────────────────────────────
INSERT INTO site_content (kind, slug, title, data, sort_order) VALUES
  ('compare_row', 'total-before-paying', 'Total shown before paying',
   '{"tomame":"Yes, itemised","forwarder":"No — card FX + forwarder fee later","traveller":"Guesswork"}', 1),
  ('compare_row', 'pay-in-cedis', 'Pay in cedis',
   '{"tomame":"MoMo or card","forwarder":"Needs a dollar card","traveller":"Cash, usually"}', 2),
  ('compare_row', 'refund-if-unavailable', 'Refund if unavailable',
   '{"tomame":"100% in 24 h","forwarder":"Store policy only","traveller":"Awkward"}', 3),
  ('compare_row', 'tracking', 'Tracking',
   '{"tomame":"Store → door, WhatsApp","forwarder":"Two separate trackers","traveller":"“Have they landed yet?”"}', 4),
  ('compare_row', 'typical-time', 'Typical time',
   '{"tomame":"2–4 weeks","forwarder":"3–6 weeks","traveller":"Whenever they travel"}', 5)
ON CONFLICT (kind, slug, locale) DO NOTHING;

-- ── Stats. Published figures, deliberately not live counts. ───────────────────
-- `boxes-delivered` is a claim, not a query: the real delivered-order count is far
-- lower. Admin edits it here rather than the copy silently contradicting the data.
INSERT INTO site_content (kind, slug, title, body, data, sort_order) VALUES
  ('stat', 'boxes-delivered',  '5,000+',  'boxes delivered since 2023', '{}', 1),
  ('stat', 'average-transit',  '16 days', 'average link-to-door',       '{}', 2),
  ('stat', 'stores',           '100+',    'US stores we buy from',      '{}', 3),
  ('stat', 'surprise-charges', '0',       'surprise charges, ever',     '{}', 4)
ON CONFLICT (kind, slug, locale) DO NOTHING;

-- ── Trust chips + hero copy ───────────────────────────────────────────────────
INSERT INTO site_content (kind, slug, title, sort_order) VALUES
  ('trust_chip', 'quote-without-account', 'Quote without an account', 1),
  ('trust_chip', 'refund-if-unsourced',   'Refund if we can''t source', 2),
  ('trust_chip', 'two-to-four-weeks',     '2–4 weeks to your door',    3)
ON CONFLICT (kind, slug, locale) DO NOTHING;

INSERT INTO site_content (kind, slug, title, body, data, sort_order) VALUES
  ('hero_copy', 'about-story', 'Buying from abroad shouldn''t feel like asking a favour.',
   'Tomame began in 2023 in Accra, when three friends got tired of begging cousins overseas to post things home. Today a small team buys, ships and delivers for thousands of Ghanaians — with the price agreed before a cedi moves.',
   '{}', 1)
ON CONFLICT (kind, slug, locale) DO NOTHING;
