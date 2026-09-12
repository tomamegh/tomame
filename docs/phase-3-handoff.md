# Phase 3 handoff — Landed price (`v2-quote`)

Reference for a fresh session picking up the Tomame redesign. Phases 0–2 are done; this is what
comes next and what you need to know before touching anything.

---

## 1. Where everything is

| What | Where |
|---|---|
| Design mocks (source of truth) | `design/*.dc.html` — plain HTML, inline styles, every value literal |
| Single artboards, easier to read | `design/_render/*.html` |
| Element → table/endpoint contract | `docs/redesign-data-map.md` — **read "Phase 3" and "Phase 3 specs" first** (§ around line 347) |
| Icon mapping | `docs/redesign-icon-map.md` |
| What Phase 2 built, and why it stopped where it did | `docs/phase-2-handoff.md` §8 — **read this, it records decisions you should not relitigate** |
| Architecture rules | `CLAUDE.md` — layering is enforced, not advisory |

**Phase 3 mocks specifically:** section `id="v2-quote"` in `design/Tomame - New Direction v2.dc.html`
(pre-flattened at `design/_render/Tomame__New_Direction_v2__2_v2-quote.html`), plus **artboard 2** of
`id="v2-mobile"` — the 390px "Landed price / product detail" view with its sticky bottom action bar.

### Running it

```bash
npx supabase start          # local DB; migrations + seed apply on `npx supabase db reset`
npm run dev                 # http://localhost:3000
python3 -m http.server 4321 --directory design   # mocks, for side-by-side
```

`.claude/launch.json` has both servers. Supabase Studio: `http://127.0.0.1:54323`.

A local test customer exists: **`kwame@tomame.local` / `TomameDev123!`**
(id `23d2a152-868a-4a52-86d3-fc8635c7f47a`), with orders, a pasted link and three price watches
seeded so the app screens render populated rather than empty.

---

## 2. What is already done

**Phase 0 — design system.** Bricolage Grotesque + Instrument Sans; the full palette as Tailwind
colours (`tm-coral tm-ink tm-paper tm-tint tm-green tm-green-ink tm-green-bg tm-amber tm-amber-bg
tm-text-2 tm-text-3 tm-border tm-hairline`), shadcn semantic tokens rebound onto them. All `tm*`
keyframes registered as utilities. Reference page `/design-system` (dev only).

**Phase 1 — marketing.** Landing, Where we buy, Fees, About, wired to live data. Migrations 036–040.

**Phase 2 — app shell + Home.** Migrations 041–042. The signed-in chrome (`AppNav`, bottom tabs,
notification bell), the Home screen (greeting, paste bar, live receipt, journeys, price watch, lane
and Ask-a-buyer cards), and `/app/watches`. Seven new endpoints. See `phase-2-handoff.md` §8.

**What Phase 2 deliberately left for you:**
- The **"Rate locked 24h" trust chip** on the Home paste bar was **removed**, because nothing backs
  it. `src/app/app/page.tsx` has a comment saying to restore it when `quote_locks` exists. That is
  Phase 3's job — the chip is currently a two-item list that should become three.
- The **"— or describe it"** tail on the paste-bar placeholder was removed for the same reason: the
  extractor takes a URL and rejects free text. See the open decision below.

---

## 3. Phase 3 scope

**One screen, and it is the commercially load-bearing one:** `v2-quote` — the landed price a
customer sees before they commit.

The screen that exists today is `src/app/app/orders/review/[id]/page.tsx` (**828 lines**, old
design), reached from `src/app/app/orders/new/page.tsx` (243 lines), which extracts from `?url=` and
forwards. Both are on the old visual language. Home's primary CTA already points at
`/app/orders/new?url=…`, so this flow is live and used.

`docs/redesign-data-map.md` §3 walks every element. The short version of what is missing:

| Element | Status today |
|---|---|
| Breadcrumb, store badge, title, receipt rows, quantity stepper | EXISTS — wire them up |
| **Rate lock** ("Rate 14.43 locked until tomorrow 4:12 PM") | **MISSING.** The rate exists; the *lock* does not. This is the most load-bearing missing piece and three screens depend on it |
| Image gallery (main + 3 thumbs + "+2") | PARTIAL — `ScrapedProduct.image` is a **single** image; extras sit untyped in `metadata` |
| Spec chips (Seller, Brand, Condition, Weight, Rating "4.6 · 38k") | PARTIAL — Brand and Weight exist. **Seller, Condition, Rating and review count are not fields.** Render conditionally; do not invent |
| Colour swatches | PARTIAL — only `size` is a chosen-variant field; colour is unstructured in `specifications` |
| "Door delivery · Accra — Free" | MISSING — no delivery fee in `PricingBreakdown`, no zone charge |
| "22 – 29 Sep at your door" | MISSING — needs `regions.transit_days_min/max` + `delivery_zones.extra_days` + a lead-time constant |
| "Add to bag" | MISSING — Phase 4 |
| "Watch price instead" | **EXISTS NOW** — Phase 2 built `price_watches` + `POST /api/watches`. Wire the button to it |

**New schema starts at migration `043`.** (041 and 042 are Phase 2's.) Exact column lists are in
`docs/redesign-data-map.md` § "Phase 3 specs":
- `quote_locks` table.
- `pricing_constants` keys `rate_lock_hours` (default 24), `purchase_lead_days_min` /
  `purchase_lead_days_max`.
- `PricingBreakdown` gains `rate_locked_until` and `rate_lock_id` (TypeScript only — `orders.pricing`
  is JSONB, no migration for those two).
- `ScrapedProduct` gains `seller`, `condition`, `rating`, `review_count`, `images[]`, `variants`
  (additive to the JSONB `extraction_cache.result` — **no migration**, but every resolver in
  `src/features/extraction/resolvers/` must populate them).

**The rate lock's server rules matter more than its UI.** `buildOrderIntake`
(`src/features/orders/services/order-intake.service.ts`) must prefer an unexpired lock's
`exchange_rate` over the live rate, and **re-price at the live rate once the lock has expired**.
Never trust a client-sent rate. The countdown is `expires_at - now()`, computed client-side from one
server value — not a client-side timer that invents its own deadline.

---

## 4. Rules that are not negotiable

**Nothing static.** Every number, list and state comes from the database or a live service. No
hardcoded arrays. Before writing a component, name its table and endpoint. If the source doesn't
exist, build it — don't fake it. This is the user's standing instruction.

**The mock's numbers are samples.** "$298", "8% US sales tax", "5% Tomame fee", "GH₵5,041.16",
"4.6 · 38k" are illustrative. Use the live pricing engine, which charges **4–8% by category** and a
**10%** US tax rate — Phase 2's Home receipt correctly renders "10% sales tax" and "4% Tomame fee"
against the mock's 8% and 5%. Match that behaviour.

**Animations are required, not decoration.** Use the mock's own per-item delays, not a uniform
stagger. Phase 2's Home receipt rows use the literal `.25s .4s .55s .7s .85s` at `0.5s` duration;
`v2-quote`'s mobile artboard reuses the same five delays. Copy the pattern in
`src/features/app-home/components/live-receipt-card.tsx`.

**Layering** (`CLAUDE.md`): `app/api/**` is HTTP orchestration only; `services/**` holds business
logic and never touches request/response objects; `db/queries/**` is data access with no business
logic or auth checks.

**Security:** RLS on every table, server-only money maths, audit every mutation, never trust
client-supplied prices or IDs. `quote_locks` is the sharpest case of this in the whole redesign — a
lock the client can influence is a discount the client can grant itself.

**The quote flow is public.** `src/proxy.ts` carves out `/app/orders/new` and `/app/orders/review`
for signed-out visitors. `quote_locks.user_id` is nullable and `session_id` exists for exactly this.
Do not add an auth gate to those routes.

**Copy:** stage word is "Purchased", not "Bought". GH₵ always leads, $ second. `.tm-nums` on every
figure. No dark surfaces — black is for text only.

---

## 5. Gotchas that will cost you an hour each

Gotchas 1–12 in `docs/phase-2-handoff.md` §5 all still apply — **read them**. The ones that will
bite hardest on this screen:

1. **Phosphor icons from `@phosphor-icons/react/ssr`** in server components. The root barrel calls
   `useContext` and breaks. No `lucide-react` in new code — note both files you are replacing still
   use it.

2. **`cn()` silently drops `leading-*`** when a font-size class sits in another argument
   (tailwind-merge treats them as one conflict group). The mocks specify type as
   `font: 700 14px/1` throughout, so this will recur. Keep size and leading in the same string,
   size first.

3. **`/app` is gated by `src/proxy.ts`, not `middleware.ts`** (Next 16 renamed it). Do not add a
   second gate in a layout — it cannot see the public quote-flow carve-outs.

4. **Screenshot verification is unreliable.** The preview pane only reliably captures the top of a
   freshly-loaded page; scrolled content returns blank. Verify below-fold content through the DOM
   (`read_page`, or JS reading `getBoundingClientRect` / computed styles).

5. **Local Supabase does not replicate hosted's default privileges.** New migrations must declare
   their `GRANT`s explicitly — see 036 and 041 for the pattern.

6. **`db/queries/**` flattens PostgREST errors**, destroying the structured `code`. Anything
   classifying errors must match message text too — see `isSchemaMissingError`.

7. **Missing tables must fail loudly.** `isSchemaMissingError` rethrows `PGRST205`/`42P01` rather
   than degrading, so a deploy before migrations produces a red build, not a half-empty page.

8. **Optional parameters are a silent-failure trap** — this has now bitten twice
   (`applyImageOverride` in Phase 1, `WatchRow`'s `now` in Phase 2). Prefer required parameters or
   data carried on the row.

9. **`searchParams.get()` already percent-decodes.** `/app/orders/new` used to call
   `decodeURIComponent` on top of it, which threw `URIError` on any URL containing a bare `%` and
   silently turned `%2B` into `+`. Fixed in Phase 2 — do not reintroduce it when you rewrite the page.

10. **`GET /api/pricing/preview`'s manual branch does not accept `productTitle`**, and fixed-freight
    matching is title-keyword based. So a quote with no extraction can never hit a
    `fixed_freight_items` rate (102 seeded rows) and is priced by group instead. If you build a
    "describe it" path, pass the description through as `productTitle`.

---

## 6. Definition of done

Current baseline on `main` with all Phase 2 work applied:

- `npm run typecheck` — clean.
- `npm run lint` — **exactly 9 pre-existing errors**. Add none, don't fix unrelated ones.
- `npx vitest run` — **599 tests in 43 files** pass. Keep green, add yours.
- Each screen rendered in the browser and compared against its mock at `localhost:4321`.
- Mobile checked at 390px — `v2-mobile` artboard 2 is the spec, and it differs from a stacked
  desktop layout (sticky bottom action bar, not the desktop's inline CTA).
- Animations actually firing, with the mock's own per-item delays, confirmed via
  `getComputedStyle(el).animationDelay` rather than by eye.

**`CLAUDE.md` requires stopping for the user's approval after each feature.** Build, show, wait.

---

## 7. Open decisions to raise early

These are genuine business decisions. Raise them before writing code — several change the schema.

1. **What does the rate lock actually cover?** (data map ambiguity 6.) FX only, or the whole landed
   price including the item price, so a store price rise is absorbed? `quote_locks.pricing`
   snapshots the entire breakdown, which is the safer reading, but it is an underwriting decision
   with real money behind it. **This blocks the table's semantics, not just its UI.**

2. **Anonymous quotes.** (ambiguity 10.) The flow is public and `quote_locks.session_id` exists for
   it — but what issues the session id, how long does it live, and does a lock survive sign-in?
   Decide before minting locks.

3. **"US sales tax 8%" vs the engine's 10%.** (ambiguity 4.) The engine applies one blended 10%
   (`tax_pct_usa`); the mock's Fees page says tax "varies by US state; some states charge none".
   Per-state tax is not modelled at all. Either model it (needs a state field and a rate table) or
   fix the copy. Phase 2 already renders the real "10% sales tax", so the copy is currently honest —
   this decision is about whether to make it *more* accurate.

4. **Flat 5% fee vs the tiered 4–8% engine.** (ambiguity 3.) Marketing says 5%; the engine charges
   per-category with a threshold tier. Either the copy becomes "from 4%" or the pricing groups are
   flattened. Revenue consequences.

5. **"Door delivery · Accra — Free".** `delivery_zones` exists and is seeded (Phase 1) with
   `fee_ghs` and `extra_days`, but `PricingBreakdown` has no delivery fee and nothing charges it.
   Is delivery free, or is this Phase 4's `delivery_fee_ghs`? The mock says "Free" on the quote and
   charges it on the bag — those cannot both be right.

6. **Restore "— or describe it"?** Phase 2 removed it because the extractor rejects free text. It
   comes back only if a describe-it intake is built (see gotcha 10, which is the pricing half of the
   same problem).

---

## 8. Things you should know that the data map does not say

- **`box_capacity_lbs` (9.00) and `consolidation_saving_pct` (0.20) already exist** in
  `pricing_constants`, despite the data map listing box capacity as having no source. That is
  Phase 4's freight box, not yours, but the constants are there.
- **`price_watches` is live**, so "Watch price instead" on this screen is a real button, not a
  Phase 3 gap — `POST /api/watches` takes `{ url }` and resolves everything server-side.
- **Migrations 036–042 are still not on the hosted database.** Nothing deploys until they are, and
  `npm run build` reads the *hosted* project (gotcha 3 in the Phase 2 doc), so a production build
  will fail loudly on the marketing and Phase 2 tables until they are pushed.
- **Five duplicate order-status label maps still exist.**
  `src/features/orders/services/journey-stage.ts` is the canonical one Phase 2 created; the others
  (`order-status-badge.tsx:4`, `deliveries/components/status-badge.tsx:4`, two `toolbar.tsx:29`,
  `order-status-timeline.tsx:8`) should collapse into it when you are next in that code.
- **`GET /api/orders` drops its envelope** (`route.ts:45-47` returns a bare array, losing `count`),
  and `POST /api/orders` duplicates `POST /api/orders/new`. Both matter more in Phases 4–5, but you
  are about to work next door to them.
