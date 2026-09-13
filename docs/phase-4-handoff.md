# Phase 4 — Bag & pay (`v2-bag`) — plan and decisions (drafted 2026-09-13, before code)

Mocks: `id="v2-bag"` in `design/Tomame - New Direction v2.dc.html` and the bag artboard of
`id="v2-mobile"`. Contract: `docs/redesign-data-map.md` §"Phase 4". Nothing below is built until
Kelvin approves §1.

## 1. Decisions needed before code (recommendation first)

### 1a. What "9 lb" box capacity means — recommend: the packing unit, not a price tier
`pricing_constants.box_capacity_lbs` (seeded 9.00 in 037, described as "chargeable weight one
consolidation box holds") is the **chargeable weight one box carries**. The bag packs lines into
boxes greedily by chargeable weight (`max(weight_lbs, minimum_chargeable_weight_lbs) × qty`); a
line heavier than the capacity gets a box of its own. The meter, "62% full" and "room for ~3.6 lb"
read from the box the line landed in. Capacity has **no pricing meaning by itself** — freight stays
`$5/lb + $3 handling` per line — it is the unit over which the consolidation saving (1b) is computed
and the operational unit the admin later closes and flies. Lines whose weight is unknown (flat-rate
groups with no listed weight) join the box at 0 lb and the meter says "weight to be confirmed".
Rejected: "freight tier" (nothing in the engine tiers on weight) and "marketing device" (the seed
already calls it a capacity; a meter that means nothing is static copy in disguise).

### 1b. What `consolidation_saving_pct` 0.20 is a percentage of — recommend: freight only
Saving = `0.20 × Σ freight of every line in a box`, **only when the box holds two or more lines**;
freight here is the weight × rate part (`freight_usd − handling_fee_usd`) for weight groups and
`flat_rate_ghs × qty` / fixed freight for the others. Handling, tax, the service fee and the item
price are untouched. This is the formula the landing widget already uses
(`marketing-content.service.ts` `getFeatureDemos`: `boxFreight × savingPct`, approved in Phase 1)
and the seed's own wording ("share of per-item freight saved when items ship together").
Rejected: merged handling fees (saves `$3 × (n−1)` — not a percentage, GH₵43 on the mock's bag,
and `0.20` would mean nothing) and landed price (a discount on the item price and tax, which Tomame
does not control).

### 1c. Anonymous bag — recommend: the cart carries `tm_quote_session`, sign-in at checkout
Same shape as the approved quote-lock decision: `carts.session_id` for signed-out visitors,
adopted onto the user on the first signed-in request (only when the user lookup misses). "Add to
bag" never forces sign-in; `POST /api/cart/checkout` and `/api/addresses` are signed-in only.

### 1d. Payment for N items — order groups (data-map option A)
`order_groups` + `orders.order_group_id`; `orders` stays one-product. One Paystack transaction per
group (`POST /api/payments/initialize { orderGroupId }`), webhook fans `paid` to every order in the
group idempotently. Each line keeps its own `quote_locks` row; checkout prices each line with
`priceLowerOf(lock, live)` and consumes every lock (`consumeQuoteLocksForOrder` per line). The bag
shows the **earliest** lock expiry.

### 1e. Delivery becomes chargeable — once per group
`order_groups.delivery_fee_ghs` = the chosen address's zone `fee_ghs` (pickup = 0), charged once
per checkout, not per box or per line. The quote screen's delivery row keeps Phase 3's wording.

### 1f. Box departure date — from a table, not a literal
"Flies from the US Fri 12 Sep" needs a schedule. Add `regions.departure_weekday` (0–6, USA seeded
5 = Friday) and `regions.departure_cutoff_hours` (seeded 24); the checkout service opens one
`consolidation_boxes` row per region per departure (`departs_at` = next departure weekday,
`cutoff_at` = departs − cutoff hours) and packs into it. The admin box console is a later phase; the
rows exist now so it has something to manage.

## 2. Schema — migration 048 (v2)
`carts`, `cart_items`, `consolidation_boxes`, `delivery_addresses`, `order_groups` as specified in
the data map, plus `orders.order_group_id / consolidation_box_id / delivery_address_id`,
`payments.order_group_id`, `regions.departure_weekday / departure_cutoff_hours`. RLS owner-only on
customer tables, admin-read on boxes, explicit GRANTs (phase-2 gotcha 2). Group-level money lives on
`order_groups` (`freight_ghs`, `consolidation_saving_ghs`, `delivery_fee_ghs`, `total_ghs`,
`total_pesewas`), computed in a new `bag-pricing.service.ts` — the per-line calculator on `main` is
not touched, so nothing here needs merging back.

## 3. Endpoints
`GET/POST /api/cart`, `PATCH/DELETE /api/cart/items/:id`, `POST /api/cart/checkout`,
`GET/POST /api/addresses`, `PATCH/DELETE /api/addresses/:id`, `POST /api/payments/initialize`
accepting `orderGroupId` (still accepts `orderId`), `GET /api/app/me` gains `bag_count`.

## 4. Feature slices (each built, shown, approved in turn)
- **F1** migration 048 + cart service/queries + `/api/cart*` + "Continue to payment" → "Add to bag"
  on the quote screen + nav bag badge from `GET /api/app/me`.
- **F2** box packing + consolidation saving + the desktop `v2-bag` screen (lines, meter, summary).
- **F3** addresses + delivery fee + checkout → order group → Paystack initialize/verify/webhook
  fan-out + "Pay GH₵X".
- **F4** mobile bag artboard (390 px, own bottom bar → `ownsMobileBottomBar`) + Home freight-box
  card on the real open cart.
- **F5** delete what the bag replaces, gates, append the outcome here.

## 5. Mock facts that shape the build (verified in the source, line numbers in the .dc.html)
- Desktop grid `1fr 420px`, gap 28, padding `32px 32px 64px`; sticky rail `top:20px` (214, 245).
- Animations, exhaustive: header `tmUp .5s both` (216); bag card `tmUp .5s .08s both` (217);
  rail `tmUp .5s .12s both` (245); Deliver-to `tmUp .5s .16s both` (236); meter fill
  `tmFill 1.2s .4s cubic-bezier(.16,1,.3,1) both` via `scaleX`, `transform-origin:left` (218).
  Bag lines, summary rows and the pay button carry **no** animation in this artboard.
- Bag line grid `84px 1fr auto` gap 18; stepper 32 px pill; per-line "Watch instead" and
  "Remove"; price `font:700 18px/1` + "$x incl. tax & fee" (219–232).
- Summary rows: items / US sales tax / Tomame fee {pct} / Freight · {boxes}, {lb} / Consolidation
  saving (green) / Door delivery; total `font:700 30px/1`; "≈ $x · rate locked {hh}h {mm}m" (249–256).
- Payment selector: MTN MoMo · Telecel Cash · AT Money · Card, 46 px, selected = 2 px coral
  border (259–264). `site_settings.payment_channels` exists but holds labels only
  (`["MTN MoMo","Telecel Cash","AT Money","Visa","Mastercard"]`); 048 reshapes it to
  `{label, paystack_channel, provider}` so the selector can pass `channels` to Paystack. The
  stale `PAYMENT_METHODS` in `src/config/ui.ts` (Vodafone/AirtelTigo) is deleted.
- Pay button 54 px gradient `#F43F5E→#F97316`, "Pay GH₵x"; hold line from `policies.payment` (266–267).
- **There is no mobile bag artboard.** `#v2-mobile` holds Home, Landed price, Journeys only
  (377–427). The mobile bag is a responsive rendering of the desktop artboard with the detail
  phone's bottom-bar pattern (`padding:12px 20px 30px`, 52 px buttons, 411) — F4 needs Kelvin's nod
  on that reading. The mobile "Add to bag" CTA uses `ph-bold ph-tote` (411).
- The mock's summary figures are static samples that do not even reconcile with its own lines
  (4,861.16 + 8,460.50 ≠ 13,489.66); every number comes from the bag pricing service.

## 6. Code facts the build hangs on (file:line, verified 2026-09-13)
- Payment ↔ order link is only `payments.metadata->>order_id` (`payments.service.ts:81-95`) plus
  `orders.payment_id`; 048 adds `payments.order_group_id`. Amount source today is
  `order.admin_total_ghs ?? order.pricing.total_ghs` (`:246`); for a group it is
  `order_groups.total_pesewas`. Idempotency lives in `transitionPaymentStatus` (`:133-164`,
  `.eq("status", from)`); `linkOrderToPayment` (`orders.service.ts:99-121`) has no status guard
  and must gain one before it fans out over N orders. `initializeTransaction` sends no `metadata`
  to Paystack (`lib/paystack/client.ts:72-88`) — the group id goes there too.
- Order status value in code is `"pending"` (`constants.ts:42-49`), not CLAUDE.md's
  `pending_payment`. Keep the code's value.
- `createOrder` inserts one product (`orders.service.ts:298-313`) and consumes the line's lock
  (`:339-357`); checkout calls it once per line inside the group.
- **Neither `POST /api/orders` nor `POST /api/orders/new` calls `finalize()`** — a viewer minted
  there never receives the cookie. `POST /api/cart` must call it; the duplicate-route collapse
  (Phase 5 list) fixes the other two.
- Quote CTA: `quote-action-bar.tsx:85` (mobile), `quote-receipt-card.tsx:231-244` (desktop),
  handler `quote-view.tsx:199-252` → `useCreateOrder` (`hooks/useCreateOrder.ts`; a second copy in
  `useOrders.ts:45-61` goes). 401 → `/auth/login?next=`; with 1c the bag POST never 401s.
- Shell: bag button hole at `app-nav.tsx:27-30`, insert between rate pill (`:96-114`) and the
  bell (`:123`); `AppChromeData` (`layout/app/types.ts:56-68`) gains `bagCount`, produced by
  `app-chrome.service.ts:22-65` (a third parallel read), so `GET /api/app/me` stays as it is.
  Bottom tabs are `grid-cols-4` (`app-bottom-tabs.tsx:44`); the bag is not a fifth tab — the mobile
  bag is reached from the nav tote and the Home freight-box card.
- Home freight-box card **does not exist** (`app/app/page.tsx:83-89`); F4 builds it beside
  `JourneysInMotion`, `tm-up` + `[animation-delay:0.2s]` like its siblings, fill via `tmFill` on
  `transform-origin:bottom` (mock line 123).
- `box_capacity_lbs` and `consolidation_saving_pct` already exist (037:10-12) and are read only by
  the landing widget (`marketing-content.service.ts:443-444`).
- `delivery_zones` (036:123-135) has `fee_ghs` per zone; `pickDefaultDoorZone` in
  `features/delivery/zones.ts:9-13`. `PricingBreakdown` (`calculator.ts:61-107`) has no delivery
  field — group-level money stays off the per-line type (see §2).

## 7. Outcome so far — F1 + F2 shipped 2026-09-13 (commits `1a4a799`, `bee1789`, `c197dee`)

### Built
| | What | Where |
|---|---|---|
| **048** | `carts`, `cart_items`, `consolidation_boxes`, `delivery_addresses`, `order_groups`, `orders.{order_group_id,consolidation_box_id,delivery_address_id}`, `payments.order_group_id`, `regions.{departure_weekday,departure_cutoff_hours}` (USA = 5), cache-cleanup guard for open bags, daily `cleanup-carts` | `supabase/migrations/048_bag_and_pay.sql` — **applied and recorded locally only; NOT on hosted** |
| **F1** | Bag service (re-prices every line on read under the viewer's lock; add-time `pricing` is informational), anonymous bags on `tm_quote_session` adopted/merged at sign-in, `GET/POST /api/cart`, `PATCH/DELETE /api/cart/items/:id`, quote CTA → "Add to bag" → "View bag · N", nav tote with real count (`AppChromeData.bagCount`) | `src/features/bag/`, `src/db/queries/carts.ts`, `src/app/api/cart/**`, `src/components/layout/app/bag-button.tsx` |
| **F2** | Pure packing + saving (`box-packing.ts`), per-bag `consolidation_boxes` rows kept on the region's next departure, `/app/bag` (desktop artboard, verified delays), stepper / remove / watch-instead | `src/features/bag/services/box-packing.ts`, `src/features/bag/components/`, `src/app/app/bag/page.tsx`, `src/db/queries/consolidation-boxes.ts` |

Not yet reshaped: `site_settings.payment_channels` (still labels only; F3 edits 048 in place — unreleased).
`PAYMENT_METHODS` in `src/config/ui.ts` still exists (F3 deletes it).

### Fixed on the way (pre-existing)
- `src/app/providers.tsx`: module-level `QueryClient` shared across server renders → one viewer's
  data in every other viewer's HTML. Now `useState(makeQueryClient)`. Verify per-viewer SSR with
  two cookie jars + curl, not the browser alone.
- Stale Turbopack cache after a branch switch under a running dev server dropped the whole
  Tomame CSS section (looked like "animations and colours missing"): `rm -rf .next`, restart.
- Turbopack did not reload server modules for the RSC page while the API route had them: if SSR
  disagrees with `/api/cart` for the same cookie, restart before debugging.

### Paystack dev key
`NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` in `.env.local` is now the real `pk_test_…` (gitignored; value not
recorded here). Not yet applied to tomame-dev on Vercel — runbook §8 procedure, secret key from state.

### Gates at this point
typecheck clean · lint exactly 9 · vitest **53 files / 707 tests** (baseline was 49/676; the
old "62/838" counted a stale worktree, since removed).

### Verified live (local dev)
Anonymous add → cookie minted → badge 1 → `/app/bag` shows Box 1 with meter, saving, countdown;
quantity + → PATCH → fill 2.2→3.4 lb, saving 100→150, total updated, badge 3; Remove → 1 line,
saving row gone; Watch instead signed-out → `/auth/login?next=/app/bag`. Local fixtures:
`b4c99974-…` (AirPods, revived to expire 2026-09-15), `11111111-…` (Oraimo), `345f5deb-…`
(Micro Center PC, 21.8 lb → its own full box).

### F3 built 2026-09-13 (uncommitted at the time of writing — awaiting Kelvin's approval)
- **048 edited in place**: `site_settings.payment_channels` → `[{id,label,paystack_channel,provider,dot}]`
  (mtn_momo / telecel_cash / at_money / card); new public `payment_hold_note`. Applied to LOCAL only
  via PostgREST (`scratchpad/apply-048-site-settings.mts`). `PAYMENT_METHODS` deleted from `src/config/ui.ts`.
- **Addresses**: `delivery_addresses` queries + `src/features/addresses/` (schema, service, hooks,
  `format.ts`), `GET/POST /api/addresses`, `PATCH/DELETE /api/addresses/:id`. First address = default;
  default flag moves atomically; deleting the default promotes the oldest.
- **Delivery on the cart**: `PATCH /api/cart {delivery_address_id | delivery_zone_id}`; `getBag`
  re-validates the choice on every read, auto-selects the signed-in default address, and `total_ghs`
  now includes `delivery_fee_ghs` (zone fee, once per checkout). `BagView.delivery` is the chosen target.
- **Checkout** `POST /api/cart/checkout` → `order_groups` + N `createOrder` (links: group, box, address;
  placed-email suppressed) + locks consumed per line + cart `checked_out` + audit `order_group_created`.
  Group money is corrected from the orders if a ratchet moved between reads. Re-POST → newest pending group.
- **Group payment**: `POST /api/payments/initialize {orderGroupId, channel}`; amount = `total_pesewas`;
  `payments.order_group_id`; Paystack gets `channels` + `metadata`. Callback/webhook fan-out flips each
  order once (`linkOrderToPayment` now guarded on `status='pending'`), group `paid` once, one email.
  Legacy `{orderId}` refuses an order that has an `order_group_id`. Success → `/app/orders?payment=success&group=`;
  failure → `/app/bag?payment=failed`, where the empty bag shows the **pending-group card** ("Finish
  paying") so the customer can retry.
- **Rail**: Deliver-to card (`tmUp .5s .16s`, 3-col tiles, pickup tile, address dialog), "Pay with"
  selector from the table (46 px, 2 px coral selected), 54 px gradient "Pay GH₵X", hold line linking
  `/policies#payment`. Delays confirmed with `getComputedStyle`.
- **Gates**: typecheck clean · lint 9 · vitest **58 files / 750 tests**.
- **Blocked**: Paystack `transaction/initialize` answers **"Invalid key"** for the `sk_test_` in
  `.env.local` — the end-to-end pay redirect could not be exercised locally. Kelvin must supply a valid
  test secret (dev Vercel state holds a real 48-char one) before F4/F5 can prove the webhook path live.
- **Local test login**: `kwame@tomame.local` (password set locally this session; see Claude memory).
  Kwame now has one address (Home · East Legon, Kumasi zone) and one pending group `4a2ae350-…` (2 orders).
- **Follow-ups noted by review, deferred**: `orderCharge`/`groupCharge` and the two `getActivePaymentFor*`
  twins should collapse into one pipeline; `checkoutBag` re-prices twice when the body restates the
  delivery; `listPaymentChannels`/`getPaymentHoldNote` read `site_settings` twice on the bag page.

## 8. F3 — what to build next (approved plan §1d/1e, data map §4)

1. **Addresses**: `GET/POST /api/addresses`, `PATCH/DELETE /api/addresses/:id` (signed-in), zod
   schema, `src/db/queries/delivery-addresses.ts`, owner-only. `delivery_zone_id` chosen from
   `delivery_zones` (door) or the pickup zone (`kind='pickup'`, no address needed). Default flag.
   Deliver-to card per mock lines 236–243 (`tmUp .5s .16s`; selected = 2 px coral + check-circle;
   "+ Pickup point" dashed tile).
2. **Payment channels**: reshape `site_settings.payment_channels` in 048 to
   `[{label, paystack_channel:"mobile_money"|"card", provider:"mtn"|"vod"|"atl"|null, dot:"#FFCC00"}]`;
   keep `readStringArray` consumers working (footer shows labels) or update them. Selector per
   mock 259–264. Delete `PAYMENT_METHODS` from `src/config/ui.ts`.
3. **Checkout** `POST /api/cart/checkout {delivery_address_id | delivery_zone_id(pickup), channel}`
   (signed-in; 401 → `/auth/login?next=/app/bag`): re-price every line (`priceLowerOf`), re-pack,
   insert `order_groups` (item_count, subtotal/tax/fee, freight, saving, `delivery_fee_ghs` =
   zone fee once, total, pesewas, address snapshot), `createOrder` per line with
   `order_group_id`/`consolidation_box_id`/`delivery_address_id` (extend `createOrderSchema` or
   pass through intake — order-intake needs `estimated_price_usd`/`origin_country` from the
   line's gap fields), consume each line's lock, set cart `checked_out` + `order_group_id`,
   audit `order_group_created`. Idempotent: an open cart already `checked_out` returns its group.
4. **Payment for a group**: `initializePaymentSchema` gains `orderGroupId` (keep `orderId`);
   amount = `order_groups.total_pesewas`; `payments.order_group_id` + `metadata.order_group_id`;
   send `channels` from the chosen channel; pass `metadata` to Paystack. Callback/webhook: claim via
   `transitionPaymentStatus`, then `linkOrderToPayment` for EVERY order in the group (add a
   `.eq("status","pending")` guard), `order_groups.status='paid'`, audit per order, one email.
   Success URL → `/app/orders?group=` (Phase 5 will own the journeys list).
5. **Rail**: "Pay with" selector + "Pay GH₵X" 54 px gradient + hold line from `policies.payment`
   (`data map` says slug `payment`; it is seeded unpublished — publish it in F, or read the row
   regardless of publish state for this one line).
6. Tests: checkout service (group totals = Σ lines − saving + delivery, lock consumption per line,
   idempotency), payment fan-out (N orders flip once), address schema.
