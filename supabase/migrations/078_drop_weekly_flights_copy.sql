-- Delivery is promised in {delivery_window}; a "weekly flights" line contradicts it.
-- Each UPDATE only touches copy that still carries the old wording, so an
-- admin's own edit is left alone and re-running is a no-op.
UPDATE site_content
SET body = 'Instant quotes, fast air freight, and a rider the day it lands. We don''t make you wait to know.', updated_at = now()
WHERE kind = 'value_prop' AND slug = 'speed'
  AND body = 'Instant quotes, weekly flights, riders the day it lands. We don''t make you wait to know.';

UPDATE site_content
SET body = 'Everything in your box flies together. Fill the box and the freight per item drops, and we show you the saving as you shop.', updated_at = now()
WHERE kind = 'feature_card' AND slug = 'one-box-less-freight'
  AND body = 'Everything you purchase in a week flies together. Fill the box and the freight per item drops, and we show you the saving as you shop.';

UPDATE regions
SET blurb = 'Our only lane for now, and a well-worn one. Consolidated air freight out of New York; electronics and sneakers are most of what flies.', updated_at = now()
WHERE code = 'USA'
  AND blurb = 'Our only lane for now, and a well-worn one. Weekly consolidated air freight out of New York; electronics and sneakers are most of what flies.';
