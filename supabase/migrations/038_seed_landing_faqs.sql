-- Migration 038: seed the landing-page FAQ rows.
--
-- 037 seeded every other `site_content` kind the redesign needs but left `faq`
-- empty, so the landing page's FAQ rail had nothing to render. The questions
-- are the six from design/Tomame - Marketing v2.dc.html (#mk-landing); the
-- answers restate facts already true of the engine and the other seeds.
--
-- As everywhere else in 037: no figure is written as text. Percentages, freight
-- rates and the FX buffer are admin-controlled and resolved at render time, so
-- the copy below deliberately names them qualitatively ("our fee", "today's
-- rate") rather than quoting a number that could go stale.

INSERT INTO site_content (kind, slug, title, body, data, sort_order) VALUES
  ('faq', 'which-stores', 'Which stores can I buy from?',
   'Right now, any store that ships within the USA — Amazon, eBay, Apple, Walmart, Best Buy and 100+ more. If we can''t read a page automatically, our team quotes it by hand within a few hours. UK and China lanes are coming soon.',
   '{"open":true}', 1),
  ('faq', 'how-price-works', 'How is the price worked out?',
   'Item price, the store''s sales tax, our fee, freight by weight, and today''s exchange rate — each on its own line before you pay. The quote is locked for 24 hours, and nothing is added afterwards.',
   '{}', 2),
  ('faq', 'mobile-money', 'Can I pay with Mobile Money?',
   'Yes. MTN MoMo, Telecel Cash and AT Money, plus Visa and Mastercard, all through Paystack in cedis. You never need a dollar card.',
   '{}', 3),
  ('faq', 'cannot-source', 'What if my item can''t be sourced?',
   'Your money is held until we have actually purchased the item. If the seller is out of stock, refuses the order or looks unsafe, we refund you in full — same day, fees included.',
   '{}', 4),
  ('faq', 'how-long', 'How long does delivery take?',
   'Two to four weeks from link to door in most cases. Boxes fly weekly out of our US hub, and a rider brings yours the day it clears in Accra — or you collect it at our Osu hub.',
   '{}', 5),
  ('faq', 'minimum-order', 'Is there a minimum order?',
   'No minimum. One lipstick or ten laptops — the same itemised quote and the same fee structure apply. Freight has a minimum chargeable weight, which the quote always shows.',
   '{}', 6)
ON CONFLICT (kind, slug, locale) DO NOTHING;
