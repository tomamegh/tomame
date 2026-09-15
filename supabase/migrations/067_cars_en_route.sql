-- Migration 067: the cars already on the water.
--
-- WHAT THIS IS. Everything else in Tomame starts with a customer pasting a link
-- to something that exists in a store's catalogue: the extractor reads the page,
-- `src/lib/pricing/calculator.ts` strikes a cedi figure, and nobody types a
-- price. A car is the opposite shape in every one of those respects, and
-- pretending otherwise is how this feature would go wrong:
--
--   * There is no page to read. A buyer finds one vehicle at one auction, on one
--     vessel, and it is gone when it is gone. The listing is WRITTEN by an admin,
--     not extracted, and there is exactly one of each.
--   * There is no formula to run. A landed car price is an auction hammer price,
--     an ocean freight quote, a Ghana Customs valuation and our fee — three of
--     which are quoted per vehicle by someone else. The pricing engine has never
--     seen a bill of lading and must not be asked to guess at one.
--   * The price is frequently not a number at all. Some cars are advertised at a
--     fixed landed figure, some are openly negotiable, and some are deliberately
--     listed with no price so that a buyer talks to the customer first.
--
-- So this migration builds an ADMIN-AUTHORED catalogue with its own price model,
-- its own photographs, and a way for a customer to start the conversation. It
-- deliberately stops there.
--
-- WHAT THIS DELIBERATELY DOES NOT BUILD. No money path. Nothing here touches
-- `orders`, `payments`, `carts`, `cart_items` or `order_groups`, and there is no
-- state in which a car can be paid for. Buying a car is a separate phase pending
-- a product decision (deposit vs. full pre-payment, and what happens to a
-- customer's money while a vehicle is mid-ocean), and putting a half-answered
-- purchase path in the database now would mean an `orders` row whose state
-- machine nobody has agreed to. A customer can look, and can ask. That is all.
--
-- THE THREE TABLES.
--   `car_listings`  — one vehicle, written by an admin, published when ready.
--   `car_photos`    — its pictures, in a private bucket, served by a route.
--   `car_enquiries` — a customer asking the price, or offering one.

BEGIN;

-- ── The bucket ──────────────────────────────────────────────────────────────
-- A third private bucket, alongside `marketing-media` (040) and `parcel-photos`
-- (054), and separate for the same reason 054 gives: lifecycle and blast radius.
-- These objects outlive nothing — a car that sails, lands and sells is a listing
-- that gets archived, and its twenty photographs go with it — whereas a
-- marketing image is a company asset an admin replaces in place. One
-- `delete from storage.objects where bucket_id = '...'` should never be able to
-- reach across the two.
--
-- PRIVATE even though the photos end up on a public page. Nothing reads the
-- bucket directly; `/api/cars/photos/[photoId]` streams the bytes with the
-- service role and re-checks on every request that the listing is still
-- published. That check is the reason an unpublished draft's photographs are not
-- quietly world-readable through a guessable storage URL while an admin is still
-- writing the listing.
INSERT INTO storage.buckets (id, name, public)
VALUES ('car-photos', 'car-photos', false)
ON CONFLICT (id) DO NOTHING;

-- ── car_listings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS car_listings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The URL segment: "2019-toyota-highlander-xle". A listing is a page a buyer
  -- sends to a customer over WhatsApp, so the link has to be readable and has to
  -- keep working — which is why it is stored rather than derived from make and
  -- model, whose spelling an admin will correct after the link has been sent.
  slug              TEXT NOT NULL UNIQUE
                      CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 120),

  -- ── What the car is ──────────────────────────────────────────────────────
  make              TEXT NOT NULL CHECK (length(btrim(make))  > 0),
  model             TEXT NOT NULL CHECK (length(btrim(model)) > 0),
  -- "XLE", "M Sport", "Limited". Nullable: plenty of vehicles have no trim, and
  -- an empty string in this column would print as a stray space on the card.
  trim              TEXT,
  -- Bounded rather than open: a typo'd year ("209") sorts a listing to the
  -- beginning of time and is the single most likely piece of bad data here. The
  -- upper bound is next year plus a margin because dealers list model years
  -- ahead of the calendar.
  year              INT NOT NULL CHECK (year BETWEEN 1950 AND 2100),

  -- MILEAGE CARRIES ITS UNIT. These vehicles are sourced from the USA (miles)
  -- and from Japan and Korea (kilometres), and an odometer reading without its
  -- unit is not a fact — 80,000 is a well-used American car or a nearly-new
  -- Japanese one. Storing a number and silently calling it "miles" is how a
  -- customer is told a car has done half what it has done. The display layer
  -- (`src/features/cars/format.ts`) prints the unit it was given and never
  -- converts, because a converted figure is no longer the number on the dash.
  mileage           INT CHECK (mileage IS NULL OR mileage BETWEEN 0 AND 2000000),
  mileage_unit      TEXT NOT NULL DEFAULT 'mi' CHECK (mileage_unit IN ('mi', 'km')),

  body_type         TEXT CHECK (body_type IS NULL OR body_type IN (
                      'sedan', 'suv', 'hatchback', 'pickup', 'van', 'coupe',
                      'wagon', 'convertible', 'bus', 'truck', 'other')),
  fuel              TEXT NOT NULL DEFAULT 'petrol' CHECK (fuel IN (
                      'petrol', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric', 'other')),
  transmission      TEXT NOT NULL DEFAULT 'automatic' CHECK (transmission IN (
                      'automatic', 'manual', 'cvt', 'other')),
  drivetrain        TEXT CHECK (drivetrain IS NULL OR drivetrain IN ('fwd', 'rwd', 'awd', '4wd')),
  exterior_colour   TEXT,

  -- The vehicle identification number, in the shape the 1981 standard fixed: 17
  -- characters, and never I, O or Q because they are indistinguishable from 1
  -- and 0 on a stamped plate. Published on purpose — a VIN is how a buyer checks
  -- the history of the car they are being sold, and withholding it reads as
  -- having something to hide. Nullable because a listing is often written from
  -- an auction sheet before the paperwork arrives.
  vin               TEXT CHECK (vin IS NULL OR vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),

  -- ── Where it is coming from, and when it lands ───────────────────────────
  --
  -- ITS OWN COUNTRY LIST, NOT `ORIGIN_COUNTRIES`. `orders.origin_country` CHECKs
  -- `('USA','UK','CHINA')` and `ORIGIN_COUNTRIES` in `src/config/constants.ts`
  -- matches it, because those three are the parcel-forwarding regions the
  -- extraction and freight rules are written for — a value there selects a
  -- pricing group and a hub address. That is a different fact from this one.
  -- Used cars come overwhelmingly from Japan, Korea and Germany, none of which
  -- Tomame forwards parcels from, and a car's origin buys nothing in the pricing
  -- engine: it is descriptive text on a listing card plus the reason a customer
  -- is or is not looking at a right-hand-drive vehicle. Reusing the parcel
  -- constant would have forced either a wrong value on every Japanese import or
  -- an expansion of a CHECK that `orders` depends on.
  origin_country    TEXT NOT NULL CHECK (origin_country IN (
                      'USA', 'CANADA', 'UK', 'GERMANY', 'JAPAN', 'KOREA', 'UAE', 'CHINA')),
  -- The ship. "MV Grande Lagos". Customers ask for it by name and track it, and
  -- it is the single most convincing detail on the page: a named vessel with a
  -- sailing date is a car that exists.
  vessel_name       TEXT,
  sailed_on         DATE,
  -- Estimated arrival at Tema, Ghana's port. A DATE and not a timestamp: nobody
  -- knows the hour, and an ETA rendered as "14:00" claims a precision that does
  -- not survive a single weather system.
  eta_tema          DATE,

  -- The admin's own prose about this car: what it has, what it does not, the
  -- scratch on the rear bumper. Free text, not a spec sheet — an honest
  -- paragraph sells a used car and a table of attributes does not.
  description       TEXT NOT NULL DEFAULT '',

  -- ── The price, which is a state and not just a number ────────────────────
  --
  -- THREE STATES, decided by the admin, and the invariant below makes the
  -- illegal combinations unrepresentable (the pattern 065 uses for sourcing).
  --
  --   'fixed'      — this is the price. Take it or leave it.
  --   'negotiable' — this is the asking price, and an offer is welcome.
  --   'on_request'  — there is no price on the page. Ask us.
  --
  -- The fourth combination people reach for — "negotiable, no starting figure" —
  -- is deliberately not a state: an offer with nothing to anchor against is a
  -- price request wearing a different hat, and it would leave the detail page
  -- with an "Make an offer" button next to a blank where the price should be.
  -- That case is `on_request`.
  price_state       TEXT NOT NULL DEFAULT 'on_request'
                      CHECK (price_state IN ('fixed', 'negotiable', 'on_request')),

  -- THE LANDED TOTAL IN PESEWAS (GHS x 100), duty and clearing included. What a
  -- customer pays to drive it away, not a port-side figure they then discover is
  -- missing GH₵40,000 of clearing.
  --
  -- AN INTEGER, never a float, matching `payments.amount` (005) and
  -- `order_groups.total_pesewas` (048). CLAUDE.md: payment amounts are in
  -- pesewas. A car is the largest figure in this product by two orders of
  -- magnitude, which is exactly where binary floating point starts losing cedis.
  --
  -- ADMIN-TYPED, NOT COMPUTED. These figures do NOT come from
  -- `src/lib/pricing/calculator.ts` and must never be wired to it. That engine
  -- prices a parcel: item price plus tax plus a value fee, converted at the
  -- day's rate, plus freight per pound. None of its inputs exist for a vehicle —
  -- there is no per-pound ocean rate, no consolidation box, and Ghana's duty on
  -- a car is assessed by Customs against its own valuation schedule, not as a
  -- percentage anybody here may calculate. A buyer collects four real quotes and
  -- types the result.
  price_pesewas             INTEGER CHECK (price_pesewas IS NULL OR price_pesewas > 0),

  -- The optional breakdown behind the headline: the "what the price is made of"
  -- card on the detail page. Every part nullable, because a buyer often has the
  -- total before they have the four pieces of it.
  vehicle_price_pesewas     INTEGER CHECK (vehicle_price_pesewas     IS NULL OR vehicle_price_pesewas     >= 0),
  freight_insurance_pesewas INTEGER CHECK (freight_insurance_pesewas IS NULL OR freight_insurance_pesewas >= 0),
  duty_clearing_pesewas     INTEGER CHECK (duty_clearing_pesewas     IS NULL OR duty_clearing_pesewas     >= 0),
  service_fee_pesewas       INTEGER CHECK (service_fee_pesewas       IS NULL OR service_fee_pesewas       >= 0),

  -- ── Editorial state ──────────────────────────────────────────────────────
  is_published      BOOLEAN NOT NULL DEFAULT FALSE,
  -- Where it sits in the list. Lower first, so a freshly-landed car can be put
  -- at the top without touching anything else's number. Not a unique column:
  -- ties break on `created_at` in the query, and forcing uniqueness would make
  -- reordering a transaction over every row.
  sort_order        INT NOT NULL DEFAULT 0,

  created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- No trigger. Recent tables in this repo stamp `updated_at` from the query
  -- layer by hand (`src/db/queries/policies.ts`), and there is no shared trigger
  -- function to hang one on; `src/db/queries/cars.ts` sets it on every UPDATE.
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- THE INVARIANT THAT MAKES THE THREE STATES REAL.
--
-- Both directions matter. Without the first branch an admin could set
-- `on_request` and leave a stale figure in `price_pesewas`, and every read path
-- that shows a price "when there is one" would print the number the listing
-- exists to withhold. Without the second, `fixed` could carry no price at all,
-- and the detail page would render a Buy-shaped listing with a blank where the
-- amount goes — the state the whole model exists to prevent. A listing may only
-- be in a purchasable-looking state if it actually carries a price.
ALTER TABLE car_listings DROP CONSTRAINT IF EXISTS car_listings_price_state_has_price;
ALTER TABLE car_listings
  ADD CONSTRAINT car_listings_price_state_has_price CHECK (
    (price_state = 'on_request' AND price_pesewas IS NULL) OR
    (price_state IN ('fixed', 'negotiable') AND price_pesewas IS NOT NULL)
  );

-- THE BREAKDOWN MAY NOT DISAGREE WITH THE HEADLINE.
--
-- The detail page shows the four components under the total. If they do not add
-- up, the customer is looking at a page that contradicts itself about money —
-- the fastest way to lose a sale worth more than everything else this platform
-- ships in a month. A CHECK can see the whole row, so the rule belongs here and
-- not in the one writer that gets it right today.
--
-- It only fires when all four parts AND the total are present: a partial
-- breakdown is a legitimate work-in-progress (the buyer has the freight quote
-- but not Customs yet) and the render simply omits the card.
ALTER TABLE car_listings DROP CONSTRAINT IF EXISTS car_listings_breakdown_sums_to_total;
ALTER TABLE car_listings
  ADD CONSTRAINT car_listings_breakdown_sums_to_total CHECK (
    price_pesewas IS NULL
    OR vehicle_price_pesewas IS NULL
    OR freight_insurance_pesewas IS NULL
    OR duty_clearing_pesewas IS NULL
    OR service_fee_pesewas IS NULL
    OR price_pesewas = vehicle_price_pesewas
                     + freight_insurance_pesewas
                     + duty_clearing_pesewas
                     + service_fee_pesewas
  );

-- A ship that arrives before it sails is a data-entry slip an admin will not
-- notice, and the listing card would print a negative "days at sea".
ALTER TABLE car_listings DROP CONSTRAINT IF EXISTS car_listings_eta_after_sailing;
ALTER TABLE car_listings
  ADD CONSTRAINT car_listings_eta_after_sailing CHECK (
    sailed_on IS NULL OR eta_tema IS NULL OR eta_tema >= sailed_on
  );

ALTER TABLE car_listings ENABLE ROW LEVEL SECURITY;

-- Explicit GRANTs: hosted Supabase grants these on new public tables by default
-- and a local `supabase start` does not (036 explains this at length).
--
-- SELECT ONLY for the API roles. 061 revoked INSERT/UPDATE/DELETE from
-- `authenticated` and `anon` across every app-written table; a car listing is
-- the most write-sensitive row in the product (it carries a five-figure price)
-- and every write goes through `createAdminClient()` behind `requireAdmin`.
GRANT SELECT ON car_listings TO anon, authenticated;
GRANT ALL    ON car_listings TO service_role;

-- Each policy is dropped first so the whole migration is re-runnable: the tables
-- are CREATE TABLE IF NOT EXISTS, and a bare CREATE POLICY on a second pass
-- fails with "already exists" and takes the transaction with it. 065 does the
-- same thing for the same reason.
--
-- Anyone may read a PUBLISHED listing, signed in or not — the whole point is a
-- page a buyer can send to somebody who has never heard of Tomame. Modelled on
-- `site_content read published` (036). A draft is invisible to everyone but an
-- admin, which is what lets a buyer write a listing over two days.
DROP POLICY IF EXISTS "car_listings read published" ON car_listings;
CREATE POLICY "car_listings read published"
  ON car_listings FOR SELECT TO anon, authenticated
  USING (is_published);

-- The house form: policies read `profiles.role`, not the JWT claim, because a
-- policy is evaluated inside the database where the claim is not the thing at
-- hand.
DROP POLICY IF EXISTS "car_listings admin write" ON car_listings;
CREATE POLICY "car_listings admin write"
  ON car_listings FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- The public list: published only, in the order the admin arranged them.
CREATE INDEX IF NOT EXISTS idx_car_listings_published
  ON car_listings (sort_order ASC, created_at DESC)
  WHERE is_published;
-- "What is arriving soon", the sort every customer asks for second.
CREATE INDEX IF NOT EXISTS idx_car_listings_eta
  ON car_listings (eta_tema ASC NULLS LAST)
  WHERE is_published;
-- A VIN identifies one physical vehicle on earth. Two listings sharing one is
-- either a duplicate or a mistake, and both are worth failing the insert over.
-- Partial, because most drafts have no VIN yet and NULLs must not collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_car_listings_vin
  ON car_listings (vin) WHERE vin IS NOT NULL;

COMMENT ON TABLE car_listings IS
  'One vehicle shipping to Tema, written by an admin. Not extracted, not priced by src/lib/pricing/calculator.ts: every money column here is typed by a buyer from real quotes.';
COMMENT ON COLUMN car_listings.price_state IS
  'fixed | negotiable | on_request. car_listings_price_state_has_price makes "priced but on request" and "fixed with no price" unrepresentable.';
COMMENT ON COLUMN car_listings.price_pesewas IS
  'Landed total in pesewas (GHS x 100), duty and clearing included. Admin-typed. NEVER an output of the pricing engine.';
COMMENT ON COLUMN car_listings.mileage_unit IS
  'mi | km — the unit on the odometer this reading was taken from. Never converted for display: 80,000 mi and 80,000 km are different cars.';
COMMENT ON COLUMN car_listings.origin_country IS
  'A car''s own origin list. Deliberately NOT ORIGIN_COUNTRIES/orders.origin_country, which is the three parcel-forwarding regions and selects a pricing group.';

-- ── car_photos ──────────────────────────────────────────────────────────────
-- Follows `order_photos` (054) closely, because the security properties are the
-- same ones and re-deriving them per feature is how one of them ends up wrong.
CREATE TABLE IF NOT EXISTS car_photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_listing_id  UUID NOT NULL REFERENCES car_listings(id) ON DELETE CASCADE,

  -- An object key inside the private `car-photos` bucket:
  -- "cars/<this row's car_listing_id>/<random>.webp". No scheme, no host, no
  -- "..", no leading slash — the same shape rule 040 and 054 apply, for the same
  -- reason: a row must not be able to point at a third party or climb out of its
  -- own prefix. The leading `[A-Za-z0-9]` is what stops the name being "..",
  -- which a bare `[A-Za-z0-9._-]+` would accept.
  storage_path    TEXT NOT NULL
                    CHECK (storage_path ~ '^cars/[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9._-]*$'),

  -- WebP only, and the dimensions are sharp's own measurements of the bytes we
  -- wrote AFTER the re-encode — never numbers taken from the upload. The
  -- re-encode is what proves the bytes are really an image rather than a
  -- polyglot, and it is where a phone's GPS EXIF tag is dropped.
  content_type    TEXT NOT NULL DEFAULT 'image/webp' CHECK (content_type = 'image/webp'),
  width           INT  NOT NULL CHECK (width     > 0),
  height          INT  NOT NULL CHECK (height    > 0),
  byte_size       INT  NOT NULL CHECK (byte_size > 0),

  -- What the picture shows: "Driver's side, front three-quarter". Doubles as the
  -- img alt text, so a listing is navigable by a screen reader rather than being
  -- twenty unlabelled photographs.
  alt_text        TEXT,
  -- Gallery order. Lower first; ties break on `created_at`.
  sort_order      INT NOT NULL DEFAULT 0,
  -- The one photograph that represents the car in a list. A flag rather than a
  -- `cover_photo_id` on the listing, so deleting a photo cannot leave the
  -- listing pointing at a row that is gone.
  is_cover        BOOLEAN NOT NULL DEFAULT FALSE,

  uploaded_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- THE CONSTRAINT THAT MATTERS, verbatim in spirit from 054. The shape check
-- above says the path looks like a listing prefix; this says it is THIS row's
-- listing prefix. Without it a photo row on published listing A may legally name
-- an object stored under unpublished listing B, and the serving route — which
-- authorises by finding the row's listing and checking that it is published,
-- then streaming whatever `storage_path` names — would publish a draft's
-- photographs with the check passing.
ALTER TABLE car_photos DROP CONSTRAINT IF EXISTS car_photos_path_matches_listing;
ALTER TABLE car_photos ADD CONSTRAINT car_photos_path_matches_listing
  CHECK (storage_path LIKE 'cars/' || car_listing_id::text || '/%');

ALTER TABLE car_photos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON car_photos TO anon, authenticated;
GRANT ALL    ON car_photos TO service_role;

-- A photo is exactly as public as the listing it belongs to, and that is
-- re-evaluated per read rather than copied onto the photo row: unpublishing a
-- listing must take its pictures with it in the same instant, and a duplicated
-- `is_published` flag here would be one more thing to forget to update.
DROP POLICY IF EXISTS "car_photos read published" ON car_photos;
CREATE POLICY "car_photos read published"
  ON car_photos FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM car_listings l WHERE l.id = car_listing_id AND l.is_published));

DROP POLICY IF EXISTS "car_photos admin write" ON car_photos;
CREATE POLICY "car_photos admin write"
  ON car_photos FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- The gallery's only query.
CREATE INDEX IF NOT EXISTS idx_car_photos_listing
  ON car_photos (car_listing_id, sort_order ASC, created_at ASC);
-- One object, one row. Also the guard against a double-insert of the same upload.
CREATE UNIQUE INDEX IF NOT EXISTS uq_car_photos_storage_path
  ON car_photos (storage_path);
-- AT MOST ONE COVER PER LISTING, in the database rather than in the service that
-- currently clears the old flag first. Two covers means the list page picks one
-- arbitrarily and a refresh changes which car the customer thinks they clicked.
CREATE UNIQUE INDEX IF NOT EXISTS uq_car_photos_cover
  ON car_photos (car_listing_id) WHERE is_cover;

COMMENT ON TABLE car_photos IS
  'Photographs of a car listing. Private bucket; bytes served only by /api/cars/photos/[photoId], which re-checks that the listing is published.';
COMMENT ON COLUMN car_photos.storage_path IS
  'Object key in the private car-photos bucket. Never a URL. car_photos_path_matches_listing ties the prefix to this row''s listing.';

-- ── car_enquiries ───────────────────────────────────────────────────────────
-- The only thing a customer can DO with a car in this phase.
--
-- Two kinds, and they are not the same conversation:
--   'price_request' — the listing is `on_request` and the customer wants a
--                     figure. They have nothing to offer yet.
--   'offer'         — the listing is `negotiable` and the customer names an
--                     amount they would pay.
--
-- One table rather than two because the queue, the ownership rule, the audit
-- trail and the answer are identical; only the presence of an amount differs,
-- and the invariant below keeps that from blurring (the same argument 065 makes
-- for putting sourcing on `price_watches`).
--
-- NOT AN ORDER. Accepting an offer records that a human said yes. It creates no
-- `orders` row, takes no money and starts no state machine. See the header.
CREATE TABLE IF NOT EXISTS car_enquiries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_listing_id  UUID NOT NULL REFERENCES car_listings(id) ON DELETE CASCADE,
  -- NOT NULL: unlike `contact_messages` (053), which routinely comes from a
  -- signed-out visitor, an enquiry about a five-figure vehicle is a named
  -- customer we will be phoning back, and that identity is also the
  -- authorization for reading the answer.
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  kind            TEXT NOT NULL CHECK (kind IN ('price_request', 'offer')),
  -- What the customer is willing to pay, in pesewas. Integer for the same reason
  -- `price_pesewas` is.
  offer_pesewas   INTEGER CHECK (offer_pesewas IS NULL OR offer_pesewas > 0),
  message         TEXT,

  -- The queue's guarded transitions, in the shape `assisted_requests` (049),
  -- `contact_messages` (053) and `order_feedback` (054) all use.
  --   open      — nobody has replied.
  --   answered  — a price was given, or the offer was countered. Ball is with
  --               the customer.
  --   accepted  — we said yes to the offer. A human follow-up, not a sale.
  --   declined  — we said no.
  --   withdrawn — the customer took it back.
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'answered', 'accepted', 'declined', 'withdrawn')),

  -- The admin's reply, read by the customer. Prose, not a code.
  admin_response  TEXT,
  -- The figure we came back with, when we came back with one — a price for a
  -- request, or a counter to an offer. Kept apart from `offer_pesewas` for the
  -- reason 065 keeps `sourced_price_usd` apart from `customer_price_hint_usd`:
  -- one is what they asked, the other is what we said, and collapsing them loses
  -- the negotiation.
  quoted_pesewas  INTEGER CHECK (quoted_pesewas IS NULL OR quoted_pesewas > 0),
  answered_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  answered_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AN OFFER CARRIES AN AMOUNT; A PRICE REQUEST DOES NOT.
--
-- Both halves are load-bearing. An offer with no figure is an empty row in the
-- queue that an admin cannot act on — they would have to email the customer to
-- ask what they just offered. A price request WITH a figure is worse: it renders
-- in the admin queue as a number somebody appears to have offered on a car that
-- has no advertised price, and it would be answered as though it were a bid.
ALTER TABLE car_enquiries DROP CONSTRAINT IF EXISTS car_enquiries_kind_amount;
ALTER TABLE car_enquiries
  ADD CONSTRAINT car_enquiries_kind_amount CHECK (
    (kind = 'offer'         AND offer_pesewas IS NOT NULL) OR
    (kind = 'price_request' AND offer_pesewas IS NULL)
  );

-- A row that has left `open` was acted on by somebody, and "who answered this
-- and when" is the first question asked when a customer says they were ignored.
-- `withdrawn` is the customer's own doing and is exempt.
ALTER TABLE car_enquiries DROP CONSTRAINT IF EXISTS car_enquiries_answered_is_attributed;
ALTER TABLE car_enquiries
  ADD CONSTRAINT car_enquiries_answered_is_attributed CHECK (
    status IN ('open', 'withdrawn') OR answered_at IS NOT NULL
  );

ALTER TABLE car_enquiries ENABLE ROW LEVEL SECURITY;
-- No `anon` grant at all: an enquiry is always a signed-in customer's own row,
-- and there is nothing here a visitor may read.
GRANT SELECT ON car_enquiries TO authenticated;
GRANT ALL    ON car_enquiries TO service_role;

-- A CUSTOMER READS THEIR OWN ENQUIRIES AND NOBODY ELSE'S. Modelled on
-- `order_groups owner read` (048). Somebody else's offer on a car is the single
-- most valuable thing on this table to a rival bidder.
DROP POLICY IF EXISTS "car_enquiries owner read" ON car_enquiries;
CREATE POLICY "car_enquiries owner read"
  ON car_enquiries FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "car_enquiries admin read" ON car_enquiries;
CREATE POLICY "car_enquiries admin read"
  ON car_enquiries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- No client INSERT policy even though this IS the customer's own words: the
-- route writes it with the service role after checking the listing, which is
-- also where the rate limit and the validation live. A direct PostgREST insert
-- would bypass both and could set `status`, `quoted_pesewas` or `answered_by` by
-- hand — i.e. a customer could accept their own offer.

-- The admin queue: open first, oldest first, because somebody is waiting on a
-- car that is only on the water for so long.
CREATE INDEX IF NOT EXISTS idx_car_enquiries_queue
  ON car_enquiries (status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_car_enquiries_listing
  ON car_enquiries (car_listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_car_enquiries_user
  ON car_enquiries (user_id, created_at DESC);
-- One live enquiry per customer per car. Without it, the "Make an offer" button
-- double-tapped on a phone puts two identical offers in the queue and an admin
-- answers one of them. Partial on the open-ended states so a customer may come
-- back with a new offer after the first was declined.
CREATE UNIQUE INDEX IF NOT EXISTS uq_car_enquiries_live
  ON car_enquiries (car_listing_id, user_id)
  WHERE status IN ('open', 'answered');

COMMENT ON TABLE car_enquiries IS
  'A customer asking about a car: a price request on an unpriced listing, or an offer on a negotiable one. Creates no order and takes no money.';
COMMENT ON COLUMN car_enquiries.offer_pesewas IS
  'What the customer offered, in pesewas. car_enquiries_kind_amount: required for an offer, forbidden on a price request.';

COMMIT;
