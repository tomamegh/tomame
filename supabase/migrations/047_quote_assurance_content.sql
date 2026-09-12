-- Migration 047: the three assurance cards under the quote's receipt.
--
-- The landed-price screen ends with three small cards: the delivery window, and
-- two promises about the customer's money. The window is computed (regions
-- transit days + the door zone's extra_days + the purchase-lead constants), but
-- the two promises are COPY, and copy on this platform lives in site_content
-- rather than in JSX — the same rule that put the marketing pages there in
-- Phase 1. An admin can reword "Money held / until we buy it" without a deploy,
-- and the quote screen cannot drift from what the policies actually say.
--
-- Kind rather than reusing 'trust_chip': trust_chip is the landing hero's
-- three-item list and is rendered as inline ticks. These are cards with an icon,
-- a headline, a subline and a link to the policy they summarise. Same table,
-- different shape, so they get their own kind and the CHECK constraint grows.
--
-- data.icon is a Phosphor glyph NAME, not markup, resolved through an explicit
-- map in the component. A database that can name an arbitrary icon component is
-- a database that can break the build.
--
-- data.href points at the policy each card is a one-line summary of, so the
-- promise on the quote and the binding text stay one click apart. The delivery
-- card has no href: it summarises nothing, it is computed.
--
-- The delivery row's title is a FALLBACK. When the pricing breakdown carries
-- delivery_eta_from/to the card shows the real window; the seeded title is what
-- renders when the region has no transit days on file, which is the honest
-- answer rather than a fabricated date range.

ALTER TABLE site_content DROP CONSTRAINT IF EXISTS site_content_kind_check;

ALTER TABLE site_content ADD CONSTRAINT site_content_kind_check CHECK (kind IN (
  'faq', 'testimonial', 'process_step', 'value_prop', 'feature_card',
  'fee_line', 'compare_row', 'stat', 'trust_chip', 'hero_copy', 'store',
  'quote_assurance'
));

INSERT INTO site_content (kind, slug, locale, title, body, data, sort_order, is_published)
VALUES
  (
    'quote_assurance',
    'delivery-window',
    'en',
    'Delivery window',
    'at your door',
    '{"icon": "CalendarCheck"}'::jsonb,
    1,
    TRUE
  ),
  (
    'quote_assurance',
    'money-held',
    'en',
    'Money held',
    'until we buy it',
    '{"icon": "ShieldCheck", "href": "/policies#payment"}'::jsonb,
    2,
    TRUE
  ),
  (
    'quote_assurance',
    'full-refund',
    'en',
    'Full refund',
    'if unsourceable',
    '{"icon": "ArrowUUpLeft", "href": "/policies#returns"}'::jsonb,
    3,
    TRUE
  )
ON CONFLICT (kind, slug, locale) DO NOTHING;
