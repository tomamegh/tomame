# Redesign data map — data-source contract

**Purpose.** The redesign mocks in `design/` are templates full of sample data. The build rule is
**"nothing static"**: every value rendered in the final build must come from a Postgres table or a
live API. No hardcoded arrays, no literals in JSX. This document is the enforcement instrument —
one row per visible element, with the verified source or the gap.

**Source mocks.** `design/Tomame - New Direction v2.dc.html` (app, 7 artboards) and
`design/Tomame - Marketing v2.dc.html` (marketing, 4 artboards), plus `design/TmNavLight.dc.html`,
`design/TmMarketingNav.dc.html`, `design/TmMarketingFooter.dc.html`. Sample data is declared in each
file's trailing `<script type="text/x-dc">` block (`renderVals()`); pre-flattened single-artboard
copies live in `design/_render/`. Build intent is stated in `design/Tomame - Handoff Doc.dc.html`
(§6 "Build notes").

**Status vocabulary.**

| Status | Means |
|---|---|
| **EXISTS** | A real table/column/endpoint backs this today. Wire it up; no schema work. |
| **PARTIAL** | Something real backs part of it. Needs a column, a join, an aggregate, or a derived value. |
| **MISSING** | Nothing in the repo backs this. Needs new schema and/or a new endpoint. |

**Phases.** 1 Marketing · 2 App shell + Home · 3 Landed price · 4 Bag & pay · 5 Journeys + detail ·
6 Account.

---

## 0. Verified current state

### 0.1 Tables that exist

| Table | Defined at | Notes |
|---|---|---|
| `profiles` | `supabase/migrations/001_create_profiles_table.sql:1-9` | `id, role, first_name, last_name, bio, created_at, updated_at`. **No phone, no address.** |
| `audit_logs` | `supabase/migrations/002_create_audit_logs_table.sql:4-13` | Append-only. SELECT is **admin-only** (`:18-25`); customer reads go through the service-role client. |
| `orders` | `004_create_orders_table.sql:4-21` + `008:12-15` + `010:5-6` + `013:5-9` + `024:5-7` + `031:5-8` | One order = one product. RLS `004:23-53`. |
| `payments` | `005_create_payments_table.sql:5-12` + `018_add_channel_to_payments.sql:4` | `amount` in **pesewas**; `metadata.order_id` is the only payment→order link (`005:11`). |
| `exchange_rates` | `012_create_exchange_rates_table.sql:5-16` | One row per `(base_currency,'GHS')`, upserted. Public read `:21-24`. |
| `fixed_freight_items` | `014_create_fixed_freight_items_table.sql:2-12` | Pre-negotiated per-item freight in GHS, keyword-matched. |
| `order_deliveries` | `017_create_order_deliveries_table.sql:4-17` | `carrier, tracking_number, tracking_url, status, estimated_delivery_date, delivered_at, notes`. **No address.** |
| `notifications` | `019_create_notifications_table.sql:4-13` | `channel, event, payload, status, sent_at`. **No `read_at` / `is_read`.** |
| `extraction_cache` | `023_create_extraction_cache_table.sql:4-12` + `025:5` + `035:14-17` | Product-keyed on `url_hash`; `result` JSONB. TTL is **6 h when complete, 15 min when partial** (`src/config/extraction.ts:36-39`, applied `src/features/extraction/extraction.service.ts:148-149`); pg_cron cleanup every 10 min, and rows referenced by an order are never hard-deleted (`035:57-69`). |
| `pricing_constants` | `027_recreate_pricing_constants_table.sql:5-15`, seeds `:38-46` + `035:73-78` | 9 keys: `freight_rate_per_lb $5`, `handling_fee_usd $3`, `minimum_tax_usd $2`, `fx_buffer_pct 0.04`, `tax_pct_usa/uk 0.10`, `tax_pct_china 0.08`, `minimum_chargeable_weight_lbs 1.00`, `default_value_fee_pct 0.05`. |
| `pricing_groups` | `028_create_pricing_groups_table.sql:5-21` | Per-category freight + `value_percentage` (service fee), tiered via `value_percentage_high`/`value_threshold_usd`. |
| `category_pricing_map` | `029_create_category_pricing_map_table.sql:5-12` | `tomame_category` → `pricing_groups.id`. |
| `policies` | `033_create_policies_table.sql:3-12` | `slug, label, content (markdown), effective_date, is_published`. Service-role only. Seeded slugs: `privacy`, `terms`, `shipping`, `returns`, `payment` — `supabase/seeds/policies.sql:9,50,92,135,260`. |

### 0.2 Tables that do **not** exist (grep-confirmed across `supabase/migrations/` and `src/`)

`pricing_config` (created `003:4-12`, **dropped** `021:7` and `022:7`, never recreated, zero code
references — CLAUDE.md's description of it is stale) · `order_items` · consolidation box / shipment /
leg · saved delivery addresses · price watch / wishlist · cart / bag · message threads · waitlist ·
testimonials · FAQ items · site stats · delivery-zone fee table · carrier-event log · rate locks.

### 0.3 Facts the whole map leans on

- **One order = one product.** `src/features/orders/types/index.ts:28-61` — scalar `product_url`,
  `product_name`, `estimated_price_usd`, `quantity`, `pricing`. No items array anywhere.
- **Order statuses** — `src/config/constants.ts:28-36`: `pending, paid, processing, in_transit,
  delivered, completed, cancelled`. Legal transitions `src/features/orders/services/orders.service.ts:394-400`.
- **Journey stages are display-only.** The handoff doc fixes the mapping (§6 Build notes):
  `pending→Awaiting payment`, `paid→Paid`, `processing→Being purchased`, `in_transit→In the air`,
  `delivered|completed→Delivered`. **No schema change is needed for the stage labels.** Today five
  duplicate label maps exist — `src/features/orders/components/order-status-badge.tsx:4-34`,
  `src/features/deliveries/components/status-badge.tsx:4-21`,
  `src/features/orders/components/admin-orders-table/toolbar.tsx:29-37`,
  `src/features/orders/components/user-orders/toolbar.tsx:29-37`,
  `src/features/orders/components/order-status-timeline.tsx:8-15` — collapse to one.
- **Pricing** — `PricingBreakdown` at `src/lib/pricing/calculator.ts:46-75`, computed by
  `calculatePricing` (`src/features/pricing/services/pricing.service.ts:53`). Input `PricingInput`
  `calculator.ts:29-42` is **strictly one line item**: one price, one quantity, one category, one
  weight. No delivery fee, no consolidation, no rate lock. Constants `src/config/pricing.ts:2,5,8,9`
  are fallbacks only, reached when the DB constants fail to load (`calculator.ts:111`).
- **Three things about freight that the seeds actively mislead about**, and that the bag screen
  depends on:
  1. `PricingBreakdown.flat_rate_ghs` (`calculator.ts:62`) is **the freight total for every
     method**, not "the flat rate". It is added in GHS *after* the USD→GHS conversion of item +
     tax + fee (`calculator.ts:259-261`).
  2. `pricing_groups.flat_rate_expression` is **dead data**. All 12 seeded formulas
     (`'5 + (w / 8)'` etc., `030:9,12`, `032:17,22-25,31,40,47,62`) are never parsed — the
     calculator only checks the column for non-null (`calculator.ts:306`) and then uses
     `freight_rate_per_lb` + `handling_fee_usd` from `pricing_constants`.
  3. `handling_fee_usd` is charged **once per order line, not per unit**
     (`calculator.ts:332-333`), while weight scales with quantity. This matters directly to the
     consolidation-saving formula in §4.
- **FX has no history and no lock.** `exchange_rates` is one mutable row per pair, upserted in
  place (`src/lib/exchange-rates/service.ts:47-73`), refreshed 6× daily by pg_cron
  (`026_exchange_rates_pg_cron.sql:33-37`, secrets via vault `034:27-56`). `getGhsRate`
  (`service.ts:136-139`) never checks `fetched_at` staleness. The only frozen rate is the
  denormalised copy inside `orders.pricing`, and the server explicitly recomputes over it at order
  creation and at payment (`src/features/extraction/types/index.ts:32-35`,
  `src/app/api/pricing/preview/route.ts:21`).
- **API envelope** is `{success, data}` / `{error, success:false}` —
  `src/lib/auth/api-helpers.ts:14-17,19-30` — except the two exchange-rate routes, which return raw
  JSON. None of the customer list endpoints paginate.
- **Product facts** available for a quote — `ScrapedProduct` at
  `src/features/extraction/scrapers/types.ts:6-33`: `title, image, price, currency, description,
  brand, category, size, weight, weight_lbs, dimensions, specifications, metadata`. **No seller,
  condition, rating, review count, or image-gallery array** (extra images land untyped in `metadata`).
  Store name comes from `ExtractionResult.platform` (`src/features/extraction/types/index.ts:11`).
- **Readable stores** — 4 platform scrapers: `src/features/extraction/scrapers/registry.ts:7-12`,
  display names `:31` (`Amazon, eBay, SHEIN, Micro Center`), plus generic JSON-LD/OpenGraph/Claude
  fallback for anything else.
- **Payment is per-order.** `POST /api/payments/initialize` takes exactly one `orderId` —
  `src/app/api/payments/initialize/route.ts:26`, `src/features/payments/schema.ts:3-5`.

---

## Phase 1 — Marketing

### 1.1 `TmMarketingNav` (`design/TmMarketingNav.dc.html`)

| Element | Binding / literal in mock | Data source today | Status |
|---|---|---|---|
| Wordmark "Tomame" | literal | brand constant, not data | EXISTS |
| Links: How it works · Where we buy · Fees · FAQ · About | literals; active state from `props.active` | route table; current nav in `src/app/(marketing)/layout.tsx` | EXISTS |
| Sign in / Get started | literals → `/auth/login`, `/auth/signup` | `src/app/auth/login`, `src/app/auth/signup` | EXISTS |

### 1.2 `TmMarketingFooter` (`design/TmMarketingFooter.dc.html`)

| Element | Binding / literal in mock | Data source today | Status |
|---|---|---|---|
| Tagline "Personal shopping from the USA…" | literal | — (copy) | EXISTS |
| WhatsApp number "+233 24 555 0192 · 8am–10pm" | literal | nothing; no settings table | MISSING |
| Column "Shop" / "Help" / "Company" links | literals | route table | EXISTS |
| "Stores we read" link target | literal | `SUPPORTED_STORE_NAMES` `src/features/extraction/scrapers/registry.ts:31` | EXISTS |
| Legal: Privacy · Terms · Shipping policy · Returns & refunds · Payment policy | literals | `policies` table, slugs `privacy/terms/shipping/returns/payment` (`supabase/seeds/policies.sql:9,50,92,135,260`) via `GET /api/policies` (`src/app/api/policies/route.ts:4-13`) | EXISTS |
| "© 2026 Tomame. Accra, Ghana." | literal | `new Date().getFullYear()` | EXISTS |
| "Payments by Paystack · MTN MoMo · Telecel Cash · AT Money · Visa · Mastercard" | literal | `PAYMENT_METHODS` `src/config/ui.ts:40-44` — **static config, and stale** ("Vodafone Cash"/"AirtelTigo" vs mock's "Telecel Cash"/"AT Money") | PARTIAL |

**Spec — site settings (Phase 1).** New table `site_settings (key text primary key, value jsonb,
updated_at, updated_by)`, admin-editable, service-role write / public read. Keys needed now:
`whatsapp_number`, `support_hours`, `payment_channels[]`, `company_address`. This is the only
home for the footer's contact strip and kills `src/config/ui.ts:40-44`.

### 1.3 `mk-landing` (`design/_render/Tomame__Marketing_v2__0_mk-landing.html`)

| Element | Binding / literal in mock | Data source today | Status |
|---|---|---|---|
| FX pill "$1 = GH₵14.43 today · shipping from the USA" | literal | `exchange_rates` (`012:5-16`) → `getGhsRate("USD")` `src/lib/exchange-rates/service.ts:136-139`, buffered by `DEFAULT_FX_BUFFER_PCT` `src/config/pricing.ts:5`; already done on the live page `src/app/(marketing)/page.tsx:18-22` | EXISTS |
| Headline / sub-copy | literals | — (copy) | EXISTS |
| Store-name cycler "Amazon → eBay → Walmart → Best Buy" | `renderVals().stores` (14 names) | `SUPPORTED_STORE_NAMES` `registry.ts:31` = 4 names. Walmart/Best Buy/Apple/Target etc. have **no scraper** | PARTIAL |
| Paste bar + "See landed price" | literal placeholder | `POST /api/products/extract` (`src/app/api/products/extract/route.ts`) — public | EXISTS |
| Trust chips: "Quote without an account" / "Refund if we can't source" / "2–4 weeks to your door" | literals | — (copy); the 2–4 weeks figure has no source | PARTIAL |
| Hero photo drop-zone `mk-hero-photo` | `image-slot` | static asset | EXISTS |
| Floating receipt: product name, `amazon.com · $298.00` | literals | last `extraction_cache` row, or a curated demo row | PARTIAL |
| Receipt rows `{{ receipt }}` — Item / US sales tax 8% / Tomame fee 5% / Freight / Rate | `renderVals().receipt` (5 literals) | `PricingBreakdown` fields `item_price_usd`, `tax_usd`+`tax_percentage`, `value_fee_usd`+`value_fee_percentage`, `flat_rate_ghs`/`freight_usd`, `exchange_rate` — `src/lib/pricing/calculator.ts:50-63` | EXISTS |
| "At your door GH₵5,041.16" | literal | `PricingBreakdown.total_ghs` `calculator.ts:63` | EXISTS |
| "Landed in Accra · 16 days" badge | literal | nothing — no lane transit-time record | MISSING |
| How it works — 4 steps `{{ steps }}` | `renderVals().steps` | hardcoded today at `src/components/marketing/process-steps.tsx:19` | MISSING |
| "Three things only a personal shopper can do" cards | literals | hardcoded today at `src/components/marketing/value.tsx:22`, `features.tsx:20` | MISSING |
| Freight-box widget "62% full · save GH₵96 with one more item" | literals | nothing — see §4 spec | MISSING |
| Price-watch teaser "MacBook Air dropped $150 · Now GH₵23,795 landed" | literals | nothing — see §2 spec | MISSING |
| Buyer photo `mk-buyer-photo` | `image-slot` | static asset | EXISTS |
| Regions strip `{{ regions }}` — code, name, stores, days, freight, Live/Soon pill | `renderVals().regions` (3) | `ORIGIN_COUNTRIES` `src/config/constants.ts:49-53` gives the three codes and nothing else. No per-region store list, transit days, freight-from, or status | PARTIAL |
| Stats `{{ stats }}` — "5,000+ boxes delivered since 2023", "16 days average link-to-door", "100+ US stores", "0 surprise charges" | `renderVals().stats` (4) | hardcoded today at `src/components/marketing/stats.tsx:10` and `src/app/(marketing)/about/page.tsx:36,43` | MISSING |
| Testimonials `{{ quotes }}` — quote, name, role, initials, 5 stars | `renderVals().quotes` (3) | hardcoded today at `src/components/marketing/testimonials.tsx:6` | MISSING |
| FAQ `{{ faqs }}` — 6 Q/A, first open | `renderVals().faqs` | hardcoded today at `src/components/marketing/faq.tsx:6` and `src/app/(marketing)/faq/page.tsx:16-89` (4 categories) | MISSING |
| "WhatsApp us — a human answers within the hour, 8am–10pm" | literal | see §1.2 `site_settings` spec | MISSING |
| CTA block + `mk-cta-photo` | literals + `image-slot` | static asset | EXISTS |

### 1.4 `mk-regions` — Where we buy

| Element | Binding / literal in mock | Data source today | Status |
|---|---|---|---|
| Hero copy, "Quote something", "Stores we read" | literals | route + `SUPPORTED_STORE_NAMES` `registry.ts:31` | EXISTS/PARTIAL |
| Arc map labels "🇺🇸 New York · 14–18 d", "🇬🇧 London · coming soon", "🇨🇳 Guangzhou · coming soon", "🇬🇭 Accra" | literals | nothing — hub city, transit band, and status are not stored | MISSING |
| Region cards `{{ regionCards }}` — name, Live/Soon pill, blurb, "Link to door", "Freight from", tag list, photo slot | `renderVals().regionCards` (3) | only the region **code** exists (`constants.ts:49-53`); freight-from could be derived from `pricing_constants.freight_rate_per_lb` × FX (`027:38-45`) but is not per-region | PARTIAL |
| Delivery-in-Ghana list `{{ cities }}` — Greater Accra free, Kumasi GH₵40, Takoradi GH₵40, Cape Coast/Tamale/Ho GH₵55, Osu pickup free | `renderVals().cities` (5) | nothing — no delivery-zone table, no delivery fee in `PricingBreakdown` (`calculator.ts:46-75`) | MISSING |
| `mk-delivery-photo` | `image-slot` | static asset | EXISTS |

### 1.5 `mk-fees` — Fees

| Element | Binding / literal in mock | Data source today | Status |
|---|---|---|---|
| "We charge 5% of the item price" | literal | **conflicts with the engine.** `pricing_groups.value_percentage` is 4–8% by category with a tier above $100 — `030_seed_pricing_groups.sql:7-12`, `032_seed_expanded_pricing_groups.sql:15-62` | PARTIAL |
| Fee rows `{{ fees }}` — Tomame fee 5% / Store sales tax at cost / Freight per lb / Exchange rate +4% / Door delivery free | `renderVals().fees` (5) | fee % → `pricing_groups.value_percentage` (`028:11`) with `default_value_fee_pct` 0.05 fallback (`035:73-78`); tax → `pricing_constants.tax_pct_usa` and `minimum_tax_usd` (`027:38-46`); freight/lb → `freight_rate_per_lb` (`027:39`); FX buffer → `fx_buffer_pct` (`027:42`) / `DEFAULT_FX_BUFFER_PCT` (`src/config/pricing.ts:5`). Titles/descriptions and the delivery row have no source | PARTIAL |
| "Store sales tax … passed through at cost" | literal | **not true today** — tax is a percentage of subtotal with a floor, not a pass-through of the store's actual charge (`calculator.ts:228-231`) | PARTIAL |
| "From GH₵74/lb out of the US, 1 lb minimum" | literal | both halves are real: `pricing_constants.freight_rate_per_lb` $5 (`027:39`) × buffered FX ≈ GH₵72, and `minimum_chargeable_weight_lbs` = 1.00 (`035:73-78`), applied at `calculator.ts:307-321` with `weight_source: "minimum"` (`calculator.ts:72`) | EXISTS |
| "locked for 24 hours from your quote" | literal | nothing — no rate lock. See §3 spec | MISSING |
| Worked example `{{ worked }}` — $298 headphones, 5 rows with bar % | `renderVals().worked` | must be a **live** `calculatePricing` call (`src/features/pricing/services/pricing.service.ts:53`) against a stored example input, not a literal table | MISSING |
| "of which Tomame keeps $14.90" | literal | `PricingBreakdown.value_fee_usd` `calculator.ts:61` | EXISTS |
| Refund card "100% back within 24 hours" | literal | `policies` slug `returns` (`supabase/seeds/policies.sql:135`) | PARTIAL |
| Rate-lock card "Mid-market + 4% buffer" | literal | `fx_buffer_pct` `027:41`; `mid_market_rate` on the breakdown `calculator.ts:57` | EXISTS |
| Comparison table `{{ compare }}` — 5 rows × 3 columns | `renderVals().compare` | nothing | MISSING |

### 1.6 `mk-about` — About

| Element | Binding / literal in mock | Data source today | Status |
|---|---|---|---|
| Story paragraph ("began in 2023 in Accra…") | literal | nothing | MISSING |
| Photo grid `mk-about-1/2/3` | `image-slot` | static assets | EXISTS |
| **"5,000+ boxes delivered since 2023"** | literal | `select count(*) from orders where status in ('delivered','completed')` is computable (`orders.status`, `004:8`/`008:6-8`) — but the real count will not be 5,000, so this must be a **published stat**, not a live count, or the copy changes | MISSING |
| Values `{{ values }}` — Transparency / Speed / Trust | `renderVals().values` (3) | hardcoded today at `src/app/(marketing)/about/page.tsx:50` | MISSING |

### Phase 1 specs

**`site_content` — marketing CMS (Phase 1).** One table replaces every hardcoded marketing array:

```
site_content (
  id uuid pk, kind text not null, slug text not null, locale text default 'en',
  title text, body text, data jsonb not null default '{}',
  sort_order int not null default 0, is_published bool not null default false,
  effective_from timestamptz, created_at, updated_at, updated_by uuid
)
unique (kind, slug, locale)
```
`kind` values needed: `faq` (`data: {question, answer, category}`), `testimonial`
(`{quote, name, role, initials, rating}`), `process_step` (`{n, icon, title, body}`), `value_prop`,
`fee_line`, `compare_row` (`{label, tomame, forwarder, traveller}`), `stat`
(`{value, label}` — the About/landing figures), `region_blurb`, `store` (marquee + "Stores we read"),
`hero_copy`. RLS: public read where `is_published`, admin write. Retires
`src/components/marketing/{faq,testimonials,process-steps,stats,value,features}.tsx` literals,
`src/app/(marketing)/faq/page.tsx:16-89`, `src/app/(marketing)/about/page.tsx:36,43,50`, and
`src/config/ui.ts:3-7`.

**`regions` — purchasing lanes (Phase 1).**

```
regions (
  code text pk,                  -- 'US' | 'UK' | 'CN'  (maps to ORIGIN_COUNTRIES)
  name text not null, status text not null check (status in ('live','soon','off')),
  hub_city text, transit_days_min int, transit_days_max int,
  freight_from_ghs_per_lb numeric,      -- or derive from pricing_constants
  store_names text[] not null default '{}', tag_names text[] not null default '{}',
  blurb text, photo_key text, sort_order int
)
```
Seed: `US` live / New York / 14–18 d; `UK`, `CN` soon. Public read, admin write. Feeds the landing
regions strip, `mk-regions` cards, the arc-map labels, and the "US live / UK+CN coming soon" pills.
Only `status='live'` is purchasable — enforce it in `buildOrderIntake`
(`src/features/orders/services/order-intake.service.ts:58-64`, which currently accepts any of the
three `ORIGIN_COUNTRIES`).

**`delivery_zones` — Ghana delivery (Phase 1 for the page, Phase 4 to charge it).**

```
delivery_zones (
  id uuid pk, name text not null,          -- 'Greater Accra', 'Kumasi', 'Osu hub pickup'
  kind text not null check (kind in ('door','pickup')),
  fee_ghs numeric not null default 0, extra_days int not null default 0,
  is_active bool not null default true, sort_order int
)
```
Seed from the mock: Accra door 0 / 0d; Kumasi 40 / +2; Takoradi 40 / +2; Cape Coast·Tamale·Ho 55 /
+3; Osu pickup 0. Public read. Phase 4 adds `delivery_fee_ghs` to `PricingBreakdown` and a
`delivery_zone_id` on the order.

**`waitlist_signups` (Phase 1).** `id, email, phone, region_code references regions(code),
created_at, notified_at`. Backs "Join the UK / China waitlist" on `v2-home` and the Soon region
cards. Public insert (rate-limited), admin read.

**Copy-vs-engine conflicts to settle before building Phase 1** (design decisions, not schema):
the flat "5%" fee (engine: 4–8% tiered), "US sales tax 8%" (engine: `tax_pct_usa` = 10%,
`src/config/pricing.ts:2` default 10%), "100+ US stores" and the 14-store marquee (4 scrapers),
and "5,000+ boxes delivered since 2023".

---

## Phase 2 — App shell + Home

### 2.1 `TmNavLight` (`design/TmNavLight.dc.html`)

| Element | Binding / literal in mock | Data source today | Status |
|---|---|---|---|
| Wordmark | literal | — | EXISTS |
| Tabs: Home · Buy for me · Price watch · Journeys | literals; `props.active` enum is `home\|shop\|ship\|orders` | routes exist for Home/Buy/Journeys (`src/app/app`, `src/app/app/orders/new`, `src/app/app/orders`); **Price watch has no route or data** | PARTIAL |
| **Live FX pill "$1 = GH₵14.43"** | literal | `exchange_rates` `012:5-16` → `getGhsRate("USD")` `src/lib/exchange-rates/service.ts:136-139` (+ `fx_buffer_pct` `027:41`). Refreshed by `src/app/api/cron/exchange-rates/route.ts`; pg_cron schedule `026_exchange_rates_pg_cron.sql`. No public endpoint yet — `getPricingRates` (`service.ts:141-153`) is server-side | PARTIAL |
| Bookmark icon (price watch) | literal | nothing | MISSING |
| **Bag count badge `{{ cart }}`** | `props.cart` default 2 | nothing — no cart/bag table | MISSING |
| **Notification bell with unread dot** | literal dot | `notifications` exists (`019:4-13`) and `GET /api/notifications` returns them (`src/app/api/notifications/route.ts:9` → `listUserNotifications` `src/features/notifications/services/notifications.service.ts:62-70`), but the table has **no `read_at`**, so "unread" is not representable. Also only two events are ever written: `order_placed`, `order_placed_admin` (`notifications.service.ts:113`, sole caller `src/features/payments/services/payments.service.ts:402-407`) | PARTIAL |
| Avatar initial "K" | literal | `profiles.first_name` `001:5` via `GET /api/app/me` (`src/app/api/app/me/route.ts:15`) | EXISTS |

**Spec — FX pill endpoint (Phase 2).** `GET /api/pricing/rate?base=USD` → `{ base, target:'GHS',
mid_market_rate, applied_rate, fetched_at }`, reading `exchange_rates` and applying
`pricing_constants.fx_buffer_pct`. Public, cacheable. Wraps the existing
`src/lib/exchange-rates/service.ts:136-153`.

**Spec — notification read state (Phase 2).** `alter table notifications add column read_at
timestamptz;` plus an owner-scoped `PATCH /api/notifications/:id/read` and
`POST /api/notifications/read-all`. RLS today has no client UPDATE policy (`019:32`) — add
`using (auth.uid() = user_id)` for UPDATE restricted to `read_at`, or route the write through the
service role. Unread count = `count(*) where user_id = me and read_at is null`. Separately, the
event vocabulary must grow before a bell is useful: price-drop, status-change, box-closing,
message-reply.

### 2.2 `v2-home`

| Element | Binding / literal in mock | Data source today | Status |
|---|---|---|---|
| Greeting "Afternoon, Kwame" | literal | `profiles.first_name` `001:5` + clock | EXISTS |
| "· 2 parcels moving" | literal | `count(orders) where status in ('paid','processing','in_transit')` — `orders.status` `004:8`, `008:6-8`; `listUserOrders` `src/features/orders/services/orders.service.ts:377` | EXISTS |
| Paste bar + store-name cycler | literals | `POST /api/products/extract`; names from `registry.ts:31` | PARTIAL |
| Chips "Price in GH₵ before you pay" / "Rate locked 24h" / "Refund if we can't source" | literals | copy; **"Rate locked 24h" is unbacked** (§3) | PARTIAL |
| "Live receipt · last link you pasted" — product name, `amazon.com · 2 min ago` | literals | `extraction_cache` most recent row for this user (`user_id` `025:5-6`, `created_at` `023:11`); `ExtractionResult.fetched_at` `src/features/extraction/types/index.ts:24` | PARTIAL |
| Receipt rows `{{ receipt }}` | 5 literals | `PricingBreakdown` `calculator.ts:50-63` | EXISTS |
| "Landed in Accra GH₵5,041.16" | literal | `PricingBreakdown.total_ghs` `calculator.ts:63` | EXISTS |
| "Add to bag" button | literal | nothing — no bag (§4) | MISSING |
| **Journeys in motion `{{ journeys }}`** — name, stage, stage %, GH₵, ETA text, 5-stop mini-track | `renderVals().journeys` (2) | name `orders.product_name` `004:12`; stage from `orders.status`; GH₵ `orders.pricing.total_ghs`; via `GET /api/orders` (`src/app/api/orders/route.ts:39`). **Stage % and "Lands Sat" are derived** — `orders.estimated_delivery_date` `008:14` is a single admin-entered `DATE`, only written on the `in_transit` transition (`orders.service.ts:440-446`) | PARTIAL |
| "All journeys →" | literal | `/app/orders` | EXISTS |
| **Freight box** — "Ships Fri", "62% full", "2 items · 5.4 lb of 9 lb", "save GH₵96 by adding one more" | literals; `props.showConsolidation` | nothing. No box entity, no bag to aggregate weight over, no capacity constant, no saving calculation. `weight_lbs` exists **per item** (`ScrapedProduct.weight_lbs` `scrapers/types.ts:26`, surfaced as `PricingBreakdown.weight_lbs` `calculator.ts:71`) | MISSING |
| **Price watch `{{ watch }}`** — name, GH₵, delta ("↓ $150 this week", "↓ 22% · lowest in 30 days", "no change"), sparkline, "we re-check daily · 3 watching" | `renderVals().watch` (3) | nothing. `extraction_cache` is a 30-minute cache (`023:31-41`), not a price series | MISSING |
| "Shipping from the USA · 14–18 days · UK and China lanes coming soon" + "Join the UK / China waitlist →" | literals | `regions` spec §1 | MISSING |
| "Ask a buyer · a real person answers on WhatsApp" + "Start a chat →" | literals | `site_settings.whatsapp_number` (§1.2) if it stays a WhatsApp deep link; an in-app thread needs §5 | MISSING |

### 2.3 `v2-landing` (signed-out app landing)

Content-identical to `mk-landing` in every respect that matters here (FX pill, paste bar, receipt,
"Three things only a personal shopper can do", footer). Rows above apply. Its own nav adds a
**"Ship to me"** link with no counterpart anywhere else — see Ambiguities.

### Phase 2 specs

**`price_watches` + `price_observations` (Phase 2).**

```
price_watches (
  id uuid pk, user_id uuid not null references profiles(id),
  product_url text not null, url_hash text not null,        -- same normalisation as extraction_cache
  product_name text, product_image_url text,
  extraction_cache_id uuid references extraction_cache(id) on delete set null,
  baseline_price_usd numeric, baseline_total_ghs numeric,
  last_price_usd numeric, last_total_ghs numeric, last_checked_at timestamptz,
  notify_on_drop bool not null default true, is_active bool not null default true,
  created_at, updated_at
)
unique (user_id, url_hash)

price_observations (
  id uuid pk, watch_id uuid not null references price_watches(id) on delete cascade,
  price_usd numeric not null, total_ghs numeric not null, exchange_rate numeric not null,
  observed_at timestamptz not null default now()
)
```
RLS: owner-only read/write on `price_watches`; owner read on observations, service-role write.
Endpoints: `GET/POST /api/watches`, `DELETE /api/watches/:id`,
`GET /api/watches/:id/history?days=30`. A daily job (extend `src/app/api/cron/exchange-rates/route.ts`
pattern, or the `jobs` table) re-extracts each active watch and appends an observation.
Everything the mock renders is then derived: delta over 7 days, "lowest in 30 days", the sparkline
(`price_observations` ordered by `observed_at`), and "3 watching" (`count(*) where is_active`).
Blocks the nav bookmark icon, the "Price watch" tab, "Watch price instead" on `v2-quote`, "Watch
instead" on `v2-bag`, and the landing price-watch teaser.

---

## Phase 3 — Landed price (`v2-quote`)

| Element | Binding / literal in mock | Data source today | Status |
|---|---|---|---|
| Breadcrumb: source URL + "Read 2 min ago" | literals | `extraction_cache.product_url` `023:7`; `ExtractionResult.fetched_at` `src/features/extraction/types/index.ts:24` | EXISTS |
| Image gallery — main + 3 thumbs + "+2" | striped placeholders | `ScrapedProduct.image` `scrapers/types.ts:10` is a **single** image; extra images are untyped in `metadata` `:32` | PARTIAL |
| Store badge "Amazon.com" + external link | literal | `ExtractionResult.platform` `types/index.ts:11`; `product_url` | EXISTS |
| Product title | literal | `ScrapedProduct.title` `scrapers/types.ts:8` | EXISTS |
| Spec chips `{{ chips }}` — Seller, Brand, Condition, Weight, Rating "4.6 · 38k" | `renderVals().chips` (5) | Brand `scrapers/types.ts:18`; Weight `:24`/`:26`. **Seller, Condition, Rating, review count are not fields** — Seller is approximable from `platform`; the rest are absent (Rainforest returns some of this but nothing persists it) | PARTIAL |
| Colour swatches "Colour · Black" | literals | `ScrapedProduct.size` `:22` is the only chosen-variant field; colour would come out of `specifications` `:30`, unstructured | PARTIAL |
| "Tell the buyer · optional" free-text | placeholder | `orders.special_instructions` `004:17` (validated `src/features/orders/schema.ts`) | EXISTS |
| "Landed in Accra GH₵5,041.16 / ≈ $349.36" | literals | `PricingBreakdown.total_ghs` `calculator.ts:63`; USD via `subtotal_usd`+fees | EXISTS |
| **"Rate 14.43 locked until tomorrow 4:12 PM"** | literal | `PricingBreakdown.exchange_rate` `calculator.ts:56` **exists**; the *lock* does not. `exchange_rates` holds one mutable row per pair (`012:5-16`, unique `:15`) with no history and no expiry | PARTIAL |
| Receipt rows `{{ receipt }}` incl. `r.note` "small parcel" | 5 literals | `PricingBreakdown` `calculator.ts:50-63`; the note maps to `fee_calculation_note` `:66` / `pricing_group` `:48` | EXISTS |
| "Door delivery · Accra — Free" | literal | nothing — no delivery fee in `PricingBreakdown` (`calculator.ts:46-75`), no zone table | MISSING |
| Quantity stepper | `1` | `orders.quantity` `004:15`; `GET /api/pricing/preview?quantity=` `src/app/api/pricing/preview/route.ts:27` (max 100). Snapshot mode `:54-67` re-prices from `extraction_cache`; the customer's `itemPriceUsd` is honoured only when the snapshot has no price `:57,63` | EXISTS |
| "Add to bag" | literal | nothing (§4) | MISSING |
| "Watch price instead" | literal | nothing (§2 spec) | MISSING |
| "22 – 29 Sep at your door" | literal | nothing. `orders.estimated_delivery_date` `008:14` is a single admin-entered date on an existing order, not a pre-purchase window | MISSING |
| "Money held until we buy it" / "Full refund if unsourceable" | literals | `policies` slugs `payment`, `returns` (`supabase/seeds/policies.sql:260,135`) | PARTIAL |

### Phase 3 specs

**Rate lock (Phase 3) — the mock's most load-bearing missing piece.** Three surfaces depend on it:
the quote's "locked until tomorrow 4:12 PM", the bag's live "rate locked 23h 12m" countdown, and
the Journeys row hint "Rate locked till 4:12 PM today".

```
quote_locks (
  id uuid pk,
  user_id uuid references profiles(id),          -- nullable: quote flow is public
  session_id text,                               -- for anonymous quotes
  extraction_cache_id uuid references extraction_cache(id) on delete set null,
  quantity int not null default 1,
  exchange_rate numeric not null,                -- the rate frozen at quote time
  mid_market_rate numeric not null,
  pricing jsonb not null,                        -- the full PricingBreakdown snapshot
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,               -- locked_at + rate_lock_hours
  consumed_by_order_id uuid references orders(id),
  created_at
)
```
Plus `pricing_constants` key `rate_lock_hours` (default 24) so the window is admin-editable
alongside `fx_buffer_pct` (`027:38-45`). Add `PricingBreakdown.rate_locked_until` and
`rate_lock_id`. Server rules: `POST /api/products/extract` and `GET /api/pricing/preview` mint or
reuse a lock; `buildOrderIntake` (`src/features/orders/services/order-intake.service.ts:34`) must
prefer an unexpired lock's `exchange_rate` over the live rate and re-price at the live rate when the
lock has expired — never trust a client-sent rate. The countdown is then `expires_at - now()`,
computed client-side from one server value.

**Product facts for the chips (Phase 3).** Extend `ScrapedProduct`
(`src/features/extraction/scrapers/types.ts:6-33`) with `seller: string | null`,
`condition: string | null`, `rating: number | null`, `review_count: number | null`,
`images: string[]`, and `variants: Record<string,string[]>`. These are additive to the JSONB
`extraction_cache.result` — **no migration needed**, but every resolver
(`src/features/extraction/resolvers/`) must populate them and `confidence`
(`src/features/extraction/types/index.ts:23`) should cover them. Until then, render chips
conditionally rather than inventing values.

**Manual-estimate mode loses fixed freight (Phase 3, small).** `GET /api/pricing/preview`'s
manual branch (`src/app/api/pricing/preview/route.ts:69-79`) does not accept `productTitle`, and
fixed-freight matching is title-keyword based (`src/lib/pricing/calculator.ts:198-209,246`). So any
quote placed without an extraction can never hit a `fixed_freight_items` rate
(`014:2-12`, 102 seeded rows in `015:4-113`) and will be priced by group instead. If the redesign
keeps a "describe it instead" path on the paste bar (`v2-home`: "— or describe it"), pass the
description through as `productTitle`.

**Pre-purchase delivery estimate (Phase 3).** "22 – 29 Sep at your door" needs
`regions.transit_days_min/max` (§1) + `delivery_zones.extra_days` (§1) + a purchase-lead-time
constant. Add `pricing_constants` keys `purchase_lead_days_min` / `purchase_lead_days_max`, and
expose the window on the pricing preview response. No new table.

---

## Phase 4 — Bag & pay (`v2-bag`)

Everything structural on this screen is new. The handoff doc says so outright (§6): *"Bag is new
state (multi-item, grouped by consolidation box)."*

| Element | Binding / literal in mock | Data source today | Status |
|---|---|---|---|
| "Your bag" + "Items travel together in one box when bought the same week" | literals | nothing | MISSING |
| **"Box 1 · flies from the US Fri 12 Sep"** | literal | nothing — no box/shipment entity, no flight schedule | MISSING |
| **Box fill meter "5.4 / 9 lb"** | literal | per-item `weight_lbs` exists (`scrapers/types.ts:26`, `calculator.ts:71`); the **sum** and the **9 lb capacity** do not | MISSING |
| Bag lines `{{ bag }}` — name, store, variant, weight, qty, GH₵, "$586.47 incl. tax & fee" | `renderVals().bag` (2) | each line's *content* is an `extraction_cache` row + a `calculatePricing` result (`pricing.service.ts:53`); the **collection** does not exist | MISSING |
| Qty stepper / "Watch instead" / "Remove" per line | literals | qty → `orders.quantity` `004:15`; watch → §2 spec; remove → bag | MISSING |
| "Room for ~3.6 lb more. Anything else from your price watch?" | literal | capacity − aggregate weight, joined to `price_watches` (§2) | MISSING |
| **"Deliver to" — Home · East Legon (12 Boundary Rd · +233 24 555 0192), Office · Airport City, + Pickup point** | literals | nothing. Grep for `address` across `supabase/migrations/` returns **zero column hits**; `profiles` has no phone either (`001:1-9`) | MISSING |
| Summary: "2 items $817.00", "US sales tax $65.36", "Tomame fee 5% $40.85", "Freight · 1 box, 5.4 lb GH₵264.00" | literals | per-item equivalents exist on `PricingBreakdown` (`calculator.ts:50-63`); **no multi-item roll-up** | PARTIAL |
| **"Consolidation saving − GH₵96.00"** | literal | nothing — no consolidation logic anywhere (`grep -i consolidat` over `src/` hits only marketing copy at `src/components/marketing/features.tsx:37` and policy prose) | MISSING |
| "Door delivery Free" | literal | `delivery_zones` (§1) + a new breakdown field | MISSING |
| **"Total GH₵13,489.66 / ≈ $934.84 · rate locked 23h 12m"** | literals | total → sum of line `total_ghs`; countdown → `quote_locks.expires_at` (§3) | MISSING |
| Payment selector: MTN MoMo · Telecel Cash · AT Money · Card | literals | `payments.channel` `018:4` records the channel Paystack reports; the **selector options** come from static config `src/config/ui.ts:40-44` (and are stale) | PARTIAL |
| **"Pay GH₵13,489.66" — one payment for N items** | literal | `POST /api/payments/initialize` takes a single `orderId` (`src/app/api/payments/initialize/route.ts:26`, `src/features/payments/schema.ts:3-5`); `payments.metadata.order_id` is singular (`005:11`); `orders.payment_id` is a per-order scalar (`004:7`, FK `005:40-42`) | MISSING |
| "Paystack holds it until every item is bought" | literal | `policies` slug `payment` (`supabase/seeds/policies.sql:260`) | PARTIAL |

### Phase 4 specs

**`carts` + `cart_items` (Phase 4; the nav badge in Phase 2 depends on it).**

```
carts (
  id uuid pk, user_id uuid references profiles(id),   -- nullable for anonymous
  session_id text, status text not null default 'open'
    check (status in ('open','checked_out','abandoned')),
  delivery_zone_id uuid references delivery_zones(id),
  delivery_address_id uuid references delivery_addresses(id),
  created_at, updated_at
)
unique (user_id) where status = 'open'

cart_items (
  id uuid pk, cart_id uuid not null references carts(id) on delete cascade,
  extraction_cache_id uuid not null references extraction_cache(id),
  quantity int not null default 1 check (quantity between 1 and 100),
  special_instructions text,
  pricing jsonb not null,            -- PricingBreakdown snapshot at add-to-bag time
  quote_lock_id uuid references quote_locks(id),
  consolidation_box_id uuid references consolidation_boxes(id),
  created_at, updated_at
)
```
RLS owner-only. Endpoints: `GET/POST /api/cart`, `PATCH/DELETE /api/cart/items/:id`,
`POST /api/cart/checkout`. Nav badge = `sum(cart_items.quantity)` for the open cart — return it on
`GET /api/app/me` (`src/app/api/app/me/route.ts:15`) so the shell renders in one request.

**`consolidation_boxes` (Phase 4).**

```
consolidation_boxes (
  id uuid pk, region_code text not null references regions(code),
  label text,                                  -- 'Box 1'
  capacity_lbs numeric not null,               -- the '9 lb' denominator
  cutoff_at timestamptz,                       -- 'buy before Fri'
  departs_at timestamptz,                      -- 'flies from the US Fri 12 Sep'
  status text not null default 'open'
    check (status in ('open','closed','in_transit','landed')),
  created_at, updated_at
)
```
`capacity_lbs` default belongs in `pricing_constants` (`box_capacity_lbs`) so admins move it without
a migration. Membership: `cart_items.consolidation_box_id` before payment,
`orders.consolidation_box_id` after. Derived values the mock shows, all computed server-side —
never client-side, since the saving is money:

- `bag_weight_lbs = Σ(cart_items.pricing.weight_lbs × quantity)`
- `fill_pct = bag_weight_lbs / capacity_lbs` → "62% full"
- `headroom_lbs = capacity_lbs − bag_weight_lbs` → "Room for ~3.6 lb more"
- `consolidation_saving_ghs = Σ(per-item standalone freight) − (one shared box freight)`, and the
  marginal "save GH₵96 by adding one more" = today's saving minus the saving at N+1 items.

**This last formula is genuinely unspecified by the mock.** The current engine has no notion of a
shared box: freight is per line and scales with quantity (`calculator.ts:332-333`, `:62`; commit
`c803f27` "Pricing: freight scales with quantity"). Three mechanics are plausible and they produce
materially different numbers:

- **(a) Minimum-weight amortisation.** `minimum_chargeable_weight_lbs` = 1.00 (`035:73-78`) is
  applied **per line** today (`calculator.ts:307-321`). Charging it once per box instead means a
  bag of five 0.2 lb items pays for 1 lb, not 5 lb. This is the mechanic the mock's arithmetic most
  resembles and the easiest to defend to a customer.
- **(b) Handling-fee amortisation.** `handling_fee_usd` = $3 (`027:40`) is charged once per line
  (`calculator.ts:333`). Once per box instead saves `$3 × (lines − 1) × fx` — for the mock's 2-item
  bag that is ~GH₵43, not GH₵96.
- **(c) A volume/weight discount tier** on `freight_rate_per_lb`. Needs a new tier table; nothing
  like it exists.

Pick one before this screen is built. Once chosen it belongs in `pricing_constants` and in a new
`calculateBoxPricing(items[])` alongside `calculatePricing`
(`src/features/pricing/services/pricing.service.ts:53`) — and the saving must be computed
server-side on every render, because it is money on screen. Note also that two of the four freight
branches (fixed-freight `calculator.ts:276-290` and flat-rate-group `:346-356`) charge GHS
directly with no weight involved at all, so a box-level saving is undefined for those items unless
the policy says they simply do not participate.

**`delivery_addresses` (Phase 4, surfaced again in Phase 6).**

```
delivery_addresses (
  id uuid pk, user_id uuid not null references profiles(id) on delete cascade,
  label text not null,                               -- 'Home', 'Office'
  kind text not null default 'door' check (kind in ('door','pickup')),
  recipient_name text not null, phone text not null,
  line1 text not null, line2 text, area text,        -- 'East Legon'
  city text not null, region text,
  delivery_zone_id uuid references delivery_zones(id),
  digital_address text,                              -- GhanaPostGPS, e.g. GA-183-4310
  is_default bool not null default false,
  created_at, updated_at
)
```
RLS owner-only. Endpoints `GET/POST /api/addresses`, `PATCH/DELETE /api/addresses/:id`. Note this
also fills the `profiles` phone gap (`001:1-9`) for order contact. Journey detail's "Deliver to
Home · East Legon" reads the address snapshot on the order.

**Multi-item orders + one payment (Phase 4) — the largest schema change in the redesign.** Two
options; pick before Phase 4 starts.

- **A. Order groups (recommended, non-breaking).** New `order_groups (id, user_id, payment_id
  references payments(id), delivery_address_id, consolidation_box_id, subtotal_usd, tax_usd,
  fee_usd, freight_ghs, consolidation_saving_ghs, delivery_fee_ghs, total_ghs, total_pesewas,
  exchange_rate, quote_lock_id, status, created_at)`, plus `orders.order_group_id uuid references
  order_groups(id)`. `orders` stays one-product — `src/features/orders/types/index.ts:28-61`,
  every existing query, and all five status-label maps keep working. Payment moves to the group:
  `initializePaymentSchema` (`src/features/payments/schema.ts:3-5`) gains `orderGroupId`, and
  `linkOrderToPayment` (`src/features/orders/services/orders.service.ts:96-103`) fans the
  `paid` transition out to every order in the group.
- **B. `order_items`.** Truer to the domain, but rewrites `Order`, every service in
  `src/features/orders/services/`, the admin order detail, deliveries
  (`src/features/deliveries/services/deliveries.service.ts:17-30`, which selects `orders` directly),
  and all pricing persistence. Higher risk for the same user-visible result.

Whichever is chosen, `payments.metadata` (`005:11`) must carry the group id and the webhook
(`src/app/api/payments/webhook/paystack/route.ts`) must remain idempotent across N orders — the
current single-order path is at `src/features/payments/services/payments.service.ts:392-437`.

---

## Phase 5 — Journeys + detail

### 5.1 `v2-journeys` (list)

| Element | Binding / literal in mock | Data source today | Status |
|---|---|---|---|
| "Journeys" / "Every item, from the store to your door." | literals | — | EXISTS |
| Filter pills "Moving · 3", "Delivered · 1", "Awaiting payment · 1" | literals | grouped counts over `orders.status` (`004:8`, `008:6-8`) via `listUserOrders` `src/features/orders/services/orders.service.ts:377` | EXISTS |
| "Where things are" `{{ stops }}` — Paid 1 / Purchased 1 / US hub 0 / In the air 1 / Your door 0 | `renderVals().stops` (5) | counts by mapped status. **"US hub" has no status** — the enum jumps `processing → in_transit` (`constants.ts:31-32`) | PARTIAL |
| Plane on the stop rail | CSS animation | derived from the same counts | EXISTS |
| Journey rows `{{ orders }}` — store, **`TM-48213`**, date, name, qty, GH₵, stage badge, progress bar | `renderVals().orders` (4, built by helper `O(...)`) | store → `ExtractionResult.platform` (`types/index.ts:11`) or `extraction_metadata` (`013:9`); date → `orders.created_at` `004:19`; name → `product_name` `004:12`; qty → `quantity` `004:15`; GH₵ → `pricing.total_ghs`; stage → `status`. **`TM-48213` does not exist** — `orders.id` is a bare UUID (`004:5`) and there is no order-number column anywhere | PARTIAL |
| Row hints: "Departed Cincinnati · lands Accra Sat" | literal | nothing — no carrier-event log; `order_deliveries.notes` (`017:14`) is one free-text field | MISSING |
| Row hint: "Our buyer is checking the seller · 1–2 days" | literal | nothing — no per-stage SLA copy | MISSING |
| Row hint: "Rate locked till 4:12 PM today" | literal | `quote_locks.expires_at` (§3) | MISSING |
| Row hint: "Signed by Kwame · 26 Aug" | literal | `order_deliveries.delivered_at` `017:13` / `orders.delivered_at` `008:15` exist; **no signer/proof-of-delivery field** | PARTIAL |
| CTAs "Track" / "Details" / "Pay now" / "Buy again" | literals | Track/Details → `/app/orders/[id]`; Pay now → `POST /api/payments/initialize` (`route.ts:10`); **Buy again** → re-extract `product_url` `004:11` | EXISTS |

### 5.2 `v2-detail` (journey detail)

| Element | Binding / literal in mock | Data source today | Status |
|---|---|---|---|
| "TM-48213 · PAID 28 AUG" | literal | order number MISSING (§5.1); paid date from the `order_status_changed` audit row `orders.service.ts:392-399` (in `payments.service.ts`) or `payments.created_at` `005:12` | PARTIAL |
| Title + stage badge "In the air" | literals | `product_name` `004:12`, `status` `004:8` | EXISTS |
| **Stage track `{{ track }}`** — Paid (28 Aug · MoMo) / Purchased (2 Sep · Amazon) / US hub (6 Sep · New York) / In the air (Departed 8 Sep) / Your door (Est. 18–20 Sep) | `renderVals().track` (5, helper `T(...)`) | timestamps are reconstructed from `audit_logs` by `getOrderAuditHistory` (`src/features/orders/services/orders.service.ts:526-538`) via `GET /api/orders/[id]/history` (`src/app/api/orders/[id]/history/route.ts:7`), matching `metadata.to` — the pattern already used by `src/features/orders/components/order-status-timeline.tsx:17-32`. **"US hub" is not a status**; the sub-lines ("· MoMo" from `payments.channel` `018:4`, "· Amazon" from platform) are joinable; **"New York" and "Est. 18–20 Sep" are not** | PARTIAL |
| **Carrier "DHL · 7734 2201 9856"** | literal | `orders.carrier` `008:13` + `orders.tracking_number` `008:12`, mirrored on `order_deliveries` `017:8-9` with `tracking_url` `017:10`. Admin-entered on the `in_transit` transition (`orders.service.ts:440-447,460-479`) | EXISTS |
| **"At your door — Thu 18 – Sat 20 Sep"** | literal | `orders.estimated_delivery_date` `008:14` / `order_deliveries.estimated_delivery_date` `017:12` are single `DATE` columns. The mock wants a **window** | PARTIAL |
| "Deliver to — Home · East Legon" | literal | nothing (§4 `delivery_addresses`) | MISSING |
| **"Updates" timeline `{{ updates }}`** — "Departed Cincinnati hub" (Sep 8 · 22:14), "Received at our US hub · 0.6 lb" (Sep 6), "Purchased from Amazon · order 114-3902" (Sep 2), "Payment received · MTN MoMo" (Aug 28) | `renderVals().updates` (4) | `audit_logs` (`002:4-13`) via `GET /api/orders/[id]/history`. Actions written today: `order_created`, `order_status_changed`, `order_cancelled_by_user`, `order_review_*`, `payment_*` (`orders.service.ts:292,484,515`; `orders.review.service.ts:191,243,272`; `payments.service.ts:395,415,440`). **Three of the four mock updates have no writer**: hub arrival, received weight, and the upstream store order number. `audit_logs` is also admin-read-only under RLS (`002:18-25`) and lacks an index on `(entity_type, entity_id)` | PARTIAL |
| "What you paid" — Item / US sales tax / Tomame fee 5% / Freight / Rate / Total | literals | `orders.pricing` JSONB = `PricingBreakdown` `calculator.ts:46-75` | EXISTS |
| "MTN MoMo · 28 Aug 10:20 · Receipt" | literal | `payments.channel` `018:4`, `payments.created_at` `005:12`, `payments.reference` `005:7`; `GET /api/transactions` (`src/app/api/transactions/route.ts:7`). **No receipt document/URL** | PARTIAL |
| Item card: store logo, "Amazon · USA", "Black · Qty 1 · 8.8 oz", "View listing" | literals | platform + `orders.origin_country` `004:16`; variant from `specifications`/`size` (`scrapers/types.ts:22,30`); weight `:24`; `product_url` `004:11` | PARTIAL |
| "Your note: Only if sold by Amazon." | literal | `orders.special_instructions` `004:17` | EXISTS |
| **"Ask about this journey"** | literal | nothing — no thread/message table | MISSING |

### Phase 5 specs

**`order_events` — the customer-facing Updates timeline (Phase 5).** `audit_logs` is the wrong
substrate: it is admin-read-only (`002:18-25`), machine-worded, and nothing writes logistics events
into it. Add a purpose-built, customer-readable log:

```
order_events (
  id uuid pk,
  order_id uuid not null references orders(id) on delete cascade,
  order_group_id uuid references order_groups(id),
  kind text not null,        -- payment_received | purchased | hub_received | departed
                             -- | arrived_country | out_for_delivery | delivered | note
  title text not null,       -- 'Departed Cincinnati hub'
  detail text,               -- 'order 114-3902', '0.6 lb'
  location text,             -- 'Cincinnati', 'New York'
  weight_lbs numeric,        -- the received weight the mock prints
  occurred_at timestamptz not null default now(),
  is_customer_visible bool not null default true,
  created_by uuid references profiles(id), created_at
)
create index on order_events (order_id, occurred_at desc);
```
RLS: owner read where `is_customer_visible`, admin read all, admin/service-role write. Endpoint
`GET /api/orders/:id/events`. Status transitions in
`updateOrderStatusAdmin` (`src/features/orders/services/orders.service.ts:402-490`) should write an
`order_events` row alongside the existing `audit_logs` row (`:481-488`) — audit stays the
compliance record, `order_events` becomes the customer narrative. The stage track's sub-lines then
come from `order_events` rather than from `metadata.to` string-matching.

**ETA window (Phase 5).** `alter table orders add column eta_from date, add column eta_to date;`
(mirror on `order_deliveries`) and widen `updateOrderStatusSchema`
(`src/features/orders/schema.ts:57-64`, which today accepts `estimated_delivery_date` as a loose
`z.string()` with no date validation). Keep `estimated_delivery_date` as the midpoint for
backwards compatibility with `src/features/deliveries/components/deliveries-table/columns.tsx:213-219`
and the status email (`src/lib/email/templates/order-status.ts`).

**Human order number (Phase 5, cheap and worth doing).** `alter table orders add column order_no
text unique;` fed by a sequence (`TM-` || `lpad(nextval('order_no_seq')::text, 5, '0')`), backfilled
for existing rows. Every mock screen shows this; a UUID prefix is not an acceptable substitute for
something the customer reads aloud on WhatsApp.

**`message_threads` + `messages` (Phase 5).** Backs "Ask about this journey" (`v2-detail`) and
"Ask a buyer" (`v2-home`).

```
message_threads (
  id uuid pk, user_id uuid not null references profiles(id),
  order_id uuid references orders(id) on delete cascade,     -- null = general enquiry
  subject text, status text not null default 'open'
    check (status in ('open','awaiting_customer','awaiting_agent','resolved')),
  last_message_at timestamptz, created_at, updated_at
)

messages (
  id uuid pk, thread_id uuid not null references message_threads(id) on delete cascade,
  sender_id uuid references profiles(id),
  sender_role text not null check (sender_role in ('user','admin','system')),
  body text not null, attachments jsonb not null default '[]',
  read_at timestamptz, created_at
)
create index on messages (thread_id, created_at);
```
RLS: owner read/insert on own threads, admin read/insert all. Endpoints `GET/POST /api/threads`,
`GET/POST /api/threads/:id/messages`, `POST /api/threads/:id/read`. Unread badge feeds the nav bell
(§2). If the launch decision is "WhatsApp deep link only", then this table is deferred and both
buttons become `site_settings.whatsapp_number` links — say which, because the mock's phrasing
("A real person answers on WhatsApp" on Home vs. a bare "Ask about this journey" on the detail)
points both ways.

**Proof of delivery (Phase 5, small).** `order_events` with `kind='delivered'` plus
`detail = 'Signed by Kwame'` covers "Signed by Kwame · 26 Aug" without new columns.

**No "US hub" status is needed.** Keep `ORDER_STATUSES` (`src/config/constants.ts:28-36`) and
`ALLOWED_TRANSITIONS` (`orders.service.ts:394-400`) exactly as they are. The 5-stop track is a
presentation layer over 7 statuses plus `order_events`: `US hub` is "an `order_events` row of kind
`hub_received` exists", not a status. This keeps the handoff doc's mapping intact and avoids
touching the state machine.

---

## Phase 6 — Account

Not drawn in the two v2 files; the handoff doc's screen map lists it as "Left rail (Profile,
Addresses, Payment, Price watch, Notifications, Security). Notifications panel design included."

| Element | Data source today | Status |
|---|---|---|
| Profile (name, bio) | `profiles.first_name/last_name/bio` `001:4-6`; `GET/PATCH /api/app/me` `src/app/api/app/me/route.ts:15,25` (schema `:9-13`) | EXISTS |
| Email | `auth.users.email` via `getAuthenticatedUser` `src/features/auth/services/auth.service.ts` | EXISTS |
| **Phone** | nothing on `profiles` (`001:1-9`) | MISSING |
| Addresses | nothing — §4 `delivery_addresses` | MISSING |
| Payment methods | `payments.channel` `018:4` is a historical record, not a saved instrument; Paystack tokenisation is not implemented | MISSING |
| Price watch | nothing — §2 `price_watches` | MISSING |
| Notifications panel | `notifications` `019:4-13` via `GET /api/notifications` `src/app/api/notifications/route.ts:9`; needs `read_at` (§2) and more `event` kinds than the two written at `src/features/notifications/services/notifications.service.ts:113` | PARTIAL |
| Notification channel prefs (email / WhatsApp toggle) | `notifications.channel` `019:7` records the channel used; **no preference storage** | MISSING |
| Security (change password) | `POST /api/auth/change-password` `src/app/api/auth/change-password/route.ts` | EXISTS |
| Activity feed | `GET /api/app/me/activity` reads `audit_logs` for `actor_id` `src/app/api/app/me/activity/route.ts:12-17` | EXISTS |

**Spec (Phase 6).** `alter table profiles add column phone text, add column whatsapp_opt_in boolean
not null default false, add column notify_email boolean not null default true;` — the minimum to
make the Notifications tab and WhatsApp updates real. Saved cards need Paystack customer/
authorisation tokens in a `payment_methods` table; treat as out of scope unless the design is
committed to it (Phase 1 exclusions in CLAUDE.md do not mention it either way).

---

## `v2-mobile`

No new data. Home / Landed price / Journeys at 390px, drawing on §2.2, §3 and §5.1 respectively;
`{{ watchM }}` is `watch.slice(0,2)` (`renderVals()`), i.e. the same `price_watches` query with
`limit 2`. Bottom tabs Home · Buy · Watch · Journeys mirror `TmNavLight`.

## `sec0` ("v2 · what changed")

Internal design-rationale artboard. Not a product screen; nothing to wire.

---

## New schema, consolidated by phase

| Phase | New tables | Column additions | New endpoints |
|---|---|---|---|
| 1 Marketing | `site_content`, `site_settings`, `regions`, `delivery_zones`, `waitlist_signups` | — | `GET /api/content?kind=`, `GET /api/regions`, `GET /api/delivery-zones`, `POST /api/waitlist` |
| 2 Shell + Home | `price_watches`, `price_observations` | `notifications.read_at` | `GET /api/pricing/rate`, `GET/POST /api/watches`, `DELETE /api/watches/:id`, `GET /api/watches/:id/history`, `PATCH /api/notifications/:id/read` |
| 3 Landed price | `quote_locks` | `pricing_constants` rows `rate_lock_hours`, `purchase_lead_days_min/max`; `PricingBreakdown.rate_locked_until`; `ScrapedProduct` gains `seller/condition/rating/review_count/images/variants` (JSONB, no migration) | rate lock minted inside `POST /api/products/extract` + `GET /api/pricing/preview` |
| 4 Bag & pay | `carts`, `cart_items`, `consolidation_boxes`, `delivery_addresses`, `order_groups` | `orders.order_group_id`, `orders.consolidation_box_id`, `orders.delivery_address_id`; `pricing_constants` row `box_capacity_lbs`; `PricingBreakdown.delivery_fee_ghs`, `consolidation_saving_ghs` | `GET/POST /api/cart`, `PATCH/DELETE /api/cart/items/:id`, `POST /api/cart/checkout`, `GET/POST /api/addresses`, `POST /api/payments/initialize` accepting `orderGroupId` |
| 5 Journeys | `order_events`, `message_threads`, `messages` | `orders.order_no` (unique), `orders.eta_from/eta_to`, `order_deliveries.eta_from/eta_to`; index `audit_logs (entity_type, entity_id)` | `GET /api/orders/:id/events`, `GET/POST /api/threads`, `GET/POST /api/threads/:id/messages` |
| 6 Account | (`payment_methods`, if saved cards ship) | `profiles.phone`, `profiles.whatsapp_opt_in`, `profiles.notify_email` | `PATCH /api/app/me` extended |

Every new table gets RLS at creation (owner-scoped for customer data, `is_published`/public for
marketing content, admin-only for boxes and zones). Every mutation to payment or order state keeps
writing `audit_logs` per CLAUDE.md.

---

## Existing defects that sit directly under redesign screens

Found while verifying the sources above. None is caused by the redesign, but each will surface as a
bug the moment the matching screen is built.

1. **`order_deliveries` upsert cannot work.** `orders.service.ts:52-57` does
   `.upsert({...}, { onConflict: "order_id" })`, but `order_id` has only a plain index
   (`017:21`) — Postgres requires a unique index for `ON CONFLICT`. The error is swallowed and
   logged (`orders.service.ts:58-63`), so carrier/tracking silently fail to persist to
   `order_deliveries` (they do land on `orders`). Fix before Phase 5:
   `create unique index on order_deliveries (order_id);`
2. **A transaction cannot be joined to its order in SQL.** `payments` has no `order_id` column
   (`005:4-13`); the link lives in `metadata.order_id` and is dug out in TypeScript
   (`src/features/payments/services/payments.service.ts:180-183`). Journey detail's "Receipt" link
   and Phase 4's group payment both need this — add a real `payments.order_group_id` column with
   the Phase 4 work.
3. **`GET /api/orders` drops its envelope.** `src/app/api/orders/route.ts:45-47` destructures
   `.orders` off `listUserOrders` and returns a bare array, losing `count`; `GET /api/orders/new`
   (`src/app/api/orders/new/route.ts:58-60`) drops `total/page/limit/totalPages` from the paginated
   result. The Journeys screen needs the counts for its filter pills.
4. **`POST /api/orders` and `POST /api/orders/new` are duplicates.** The UI calls the latter
   (`src/features/orders/hooks/useOrders.ts:50`). Collapse to one before Phase 4 changes intake.
5. **A dead admin endpoint.** `useUpdateOrderStatus` posts to `/api/admin/orders/:id/status`
   (`src/features/orders/hooks/useOrders.ts:144`), which does not exist — the real one is
   `PATCH /api/admin/orders/[id]`.
6. **Rate-limit key collision.** `src/app/api/pricing/rates/refresh/route.ts:13` uses the key
   `admin-deliveries:${ip}`, sharing a bucket with the deliveries endpoint.
7. **`audit_logs` has no index on `(entity_type, entity_id)`** (`002:4-13`), yet that is exactly
   the lookup the journey timeline performs (`orders.service.ts:165-170`).
8. **`GET /api/app/me` returns the whole Supabase user object** (`src/app/api/app/me/route.ts:19`),
   including identities and sign-in timestamps, and its PATCH wraps the result differently from its
   GET (`:58`). The app shell will call this on every page — tighten it in Phase 2.

## Admin surfaces these customer features imply, which the design does not show

1. **Marketing content editor.** `site_content` is useless without a CRUD screen —
   FAQ ordering, testimonials, stats, fee lines, comparison rows, hero copy, publish toggles. The
   nearest precedent is the policies editor (`src/app/admin/policies/[slug]`,
   `src/features/policies/components/rich-text-editor.tsx`); extend that pattern. Also
   `site_settings` (WhatsApp number, support hours, payment channels).
2. **Order-message inbox.** `message_threads` needs an admin queue: unassigned / awaiting-agent
   filters, per-thread reply, assignment, resolve. No admin messaging UI exists today
   (`src/app/admin/` has orders, deliveries, transactions, users, policies, notifications,
   settings). Note the existing public contact form (`src/features/contact/components/contact-form.tsx`,
   `src/features/contact/hooks/useContactForm.ts`) has **no table and no admin view behind it
   either** — folding it into `message_threads` with `order_id is null` kills two gaps at once.
   Without this, "Ask about this journey" is a black hole.
3. **Consolidation box console.** Open a box per region, set `capacity_lbs` and `cutoff_at`, assign
   cart/order items to boxes, close a box and mark it departed. This is the operational heart of the
   freight-box promise and appears nowhere in the mocks. It also drives the "flies from the US Fri
   12 Sep" date customers see.
4. **`order_events` composer.** Someone has to type "Departed Cincinnati hub" and "Received at our
   US hub · 0.6 lb", with a customer-visible toggle. The existing admin order detail
   (`src/features/orders/components/admin-order-detail.tsx`) only edits status + carrier + tracking
   + ETA + one notes field, and only on the `in_transit` transition
   (`src/features/orders/services/orders.service.ts:440-447`).
5. **Waitlist management.** `waitlist_signups` needs a list, export, and a "notify this region"
   action when a lane opens.
6. **Price-watch job monitoring.** A daily re-extraction over every active watch is the
   highest-volume outbound job the platform will run and the most likely to burn scraper credit.
   Needs run history, failure counts, and a per-watch pause — the `jobs` table
   (referenced in CLAUDE.md and `AUDIT_ENTITY_TYPES.JOB` at `src/config/constants.ts:12`) has **no
   migration in `supabase/migrations/`** and would need creating.
7. **Delivery-zone and region admin.** Fee and transit-day edits are pricing changes and must be
   audited like `pricing_constants` edits are (`src/app/api/admin/pricing-constants/route.ts`).
8. **Refund handling.** "Full refund if unsourceable, within 24 hours" is promised on three
   screens. `payments.status` has no `refunded` value (`005:10`), there is no refund endpoint, and
   the reject path just sets the order to `cancelled`
   (`src/features/orders/services/orders.review.service.ts:258-263`). Either the copy softens or
   this becomes real work.
9. **Order-number backfill and box assignment** are one-off admin/migration tasks worth planning
   alongside Phase 4/5.

---

## Genuine ambiguities — decide, do not invent

1. **Consolidation saving formula.** Discussed in §4 with the three candidate mechanics and their
   very different amounts. It is money on screen. Blocks `v2-bag`, the Home freight box, and the
   landing page's freight-box widget.
2. **Box capacity of "9 lb".** A per-box physical limit, a freight-tier boundary, or a marketing
   device? If freight is `$5/lb` with no tiering (`027:38`), a 9 lb ceiling has no pricing meaning,
   and neither does filling it.
3. **Flat 5% fee vs. the tiered 4–8% engine.** `030:7-12` and `032:15-62` set `value_percentage`
   per category with a `value_threshold_usd` tier. Either the marketing copy becomes "from 5%" /
   "5% on most items", or the pricing groups are flattened. This is a business decision with revenue
   consequences.
4. **"US sales tax 8%".** The engine's `tax_pct_usa` is 10% (`027:44`) and `TAX_PERCENTAGE` defaults
   to 10% (`src/config/pricing.ts:2`), applied uniformly. The mock's Fees page says tax "varies by
   US state; some states charge none". Per-state tax is not modelled at all. Decide whether to model
   it (needs a state field on the address/quote and a rate table) or to keep one blended rate and
   fix the copy.
5. **"Ship to me" nav link** on `v2-landing`, and the `ship` option in `TmNavLight`'s `active` enum,
   with no corresponding v2 artboard. The v1 mock's `renderVals()` still carries `shipSteps` and
   `addr` (a US forwarding address: "1120 Tomame Logistics Way, TM-KA-4821, New Castle DE"), and
   both are **declared but never rendered** in the v2 file. The handoff doc explicitly says
   "No personal US address". Treat package-forwarding as **out of scope** and delete the nav link,
   or confirm it is a planned Phase 7. It is not costed here.
6. **"Rate locked 24h" scope.** Does a lock cover the FX rate only, or the whole landed price
   (item price included, so a store price rise is absorbed)? `quote_locks.pricing` above snapshots
   the entire breakdown, which is the safer reading, but it is an underwriting decision.
7. **Live counts vs. published stats.** "5,000+ boxes delivered since 2023", "16 days average
   link-to-door", "100+ US stores", "0 surprise charges". Some are computable from `orders`, some
   are not, and the computed values will not match the copy at launch. Say per stat whether it is a
   live aggregate or an admin-entered figure — `site_content` `kind='stat'` supports either, but
   only one is honest.
8. **"Ask a buyer" channel.** In-app thread (`message_threads`) or WhatsApp deep link? §5 covers
   both; the mock's copy points both ways on different screens.
9. **Journey row hint copy** ("Our buyer is checking the seller · 1–2 days"). Per-stage boilerplate
   from `site_content`, or per-order text from `order_events`? The mock's four hints are three
   different kinds of thing (a logistics event, a stage SLA, a rate-lock countdown, a delivery
   proof), so at least three sources are involved.
10. **Anonymous bag.** The quote flow is public (CLAUDE.md; `src/app/api/pricing/preview/route.ts:22`).
    Can a signed-out visitor fill a bag, or does "Add to bag" force sign-in? The `carts` spec allows
    a `session_id` for the anonymous case; the mock never shows a signed-out bag.
