# Phase 2 handoff — App shell + Home

Reference for a fresh session picking up the Tomame redesign. Phases 0 and 1 are
done; this is what comes next and what you need to know before touching anything.

---

## 1. Where everything is

| What | Where |
|---|---|
| Design mocks (source of truth) | `design/*.dc.html` — plain HTML, inline styles, every value literal |
| Single artboards, easier to read | `design/_render/*.html` |
| Element → table/endpoint contract | `docs/redesign-data-map.md` — **read the "Phase 2" and "Phase 2 specs" sections first** |
| Icon mapping | `docs/redesign-icon-map.md` |
| Architecture rules | `CLAUDE.md` — layering is enforced, not advisory |

**Phase 2 mocks specifically:** section `id="v2-home"` in `design/Tomame - New Direction v2.dc.html`,
`design/TmNavLight.dc.html` (app nav), and `id="v2-mobile"` for the 390px views.

### Running it

```bash
npx supabase start          # local DB; migrations + seed apply on `npx supabase db reset`
npm run dev                 # http://localhost:3000
python3 -m http.server 4321 --directory design   # mocks, for side-by-side
```

`.claude/launch.json` has both servers (`tomame-dev`, `design-kit`) if your harness uses it.
Supabase Studio: `http://127.0.0.1:54323`.

---

## 2. What is already done

**Phase 0 — design system.** Bricolage Grotesque + Instrument Sans via `next/font`; the full
palette as Tailwind colours (`tm-coral tm-ink tm-paper tm-tint tm-green tm-green-ink tm-green-bg
tm-amber tm-amber-bg tm-text-2 tm-text-3 tm-border tm-hairline`), with shadcn's semantic tokens
rebound onto them so `bg-card` / `border-border` / `bg-primary` are already correct. Radius base
14px. All 13 `tm*` keyframes registered as utilities (`tm-up`, `tm-stagger`, `tm-print`, `tm-fill`,
`tm-float`, `tm-pop`, `tm-pulse-dot`, `tm-plane`, `tm-arc`, `tm-marquee`, `tm-words`). Reduced-motion
guard lives in `@layer base`. Reference page: `/design-system` (dev only).

**Phase 1 — marketing.** Landing, Where we buy, Fees, About, all wired to live data. Five content
tables (migrations 036–037), `media_overrides` (039) and uploads (040). `/builder` lets an admin
replace and re-crop photos at runtime.

**Not done, deliberately:** `/faq`, `/contact` and `/policies` still use the old design, and `/faq`
is linked from the new nav. That is an open decision, not an oversight.

---

## 3. Phase 2 scope

Three surfaces: **`TmNavLight`** (the app nav), **`v2-home`**, and the **390px mobile** views with
bottom tabs (Home · Shop · Watch · Journeys).

`docs/redesign-data-map.md` §2 walks every element. The short version of what is missing:

| Element | Status today |
|---|---|
| Greeting, "2 parcels moving" | Derivable now — `profiles.first_name`, count of orders in `paid`/`processing`/`in_transit` |
| Live receipt (last link pasted) | **Was wrong.** `extraction_cache` is PRODUCT-keyed (035) and its `user_id` is only "who last requested it", overwritten by the next customer to paste the same link. Phase 2 added `extraction_requests` instead |
| Journeys-in-motion, 5-stop track | Partial — stage maps from `orders.status`, but **stage % and "Lands Sat" have no source**. `orders.estimated_delivery_date` is a single admin-entered DATE written only on the `in_transit` transition |
| FX pill | Rate exists; **no public endpoint**. Needs `GET /api/pricing/rate` |
| Notification bell + unread dot | `notifications` exists but has **no `read_at`**, and only two events are ever written (`order_placed`, `order_placed_admin`) |
| Price watch | **Nothing.** Needs `price_watches` + `price_observations` + a daily job |
| Freight box | **Nothing.** Needs box capacity, bag weight aggregation, consolidation saving |
| Bag count badge | **Nothing** — that's Phase 4 |

**New schema (start at migration `041`):** `price_watches`, `price_observations`, and
`alter table notifications add column read_at timestamptz`. Exact column lists are in
`docs/redesign-data-map.md` §"Phase 2 specs".

**Two things Phase 2 cannot finish.** The bag count badge and "Add to bag" belong to Phase 4, and
the freight box needs the bag to aggregate weight over. Render them from whatever real state exists
or leave them out — do not stub them with fake numbers.

---

## 4. Rules that are not negotiable

**Nothing static.** Every number, list and state comes from the database or a live service. No
hardcoded arrays of journeys, watches or stats. Before writing a component, name its table and
endpoint. If the source doesn't exist, build it — don't fake it. This is the user's standing
instruction and the reason Phase 1 needed five new tables.

**The mock's numbers are samples.** "5%", "8% US sales tax", "$298 headphones", "GH₵96 saving" are
illustrative. Use the live pricing engine. The user confirmed this explicitly. Phase 1 renders the
fee as "5% · from 4%" because the engine charges 4–8% by category and a bare 5% would be false.

**Layering** (`CLAUDE.md`): `app/api/**` is HTTP orchestration only; `services/**` holds business
logic and never touches request/response objects; `db/queries/**` is data access with no business
logic or auth checks. Violations are treated as bugs.

**Security:** RLS on every table, server-only money maths, audit every mutation, never trust
client-supplied prices or IDs.

**Payments:** single Paystack-branded button and redirect. The mock's MoMo/Telecel/AT/Card selector
is **not** being built — Paystack collects the channel.

**Regions:** only `status='live'` is purchasable. UK/China render disabled with a waitlist CTA.
`regions` table already exists and is seeded.

**Copy:** stage word is "Purchased", not "Bought". GH₵ always leads, $ second. `.tm-nums` on every
figure. No dark surfaces — black is for text only.

---

## 5. Gotchas that will cost you an hour each

These were all learned the expensive way in Phases 0–1.

1. **Phosphor icons must be imported from `@phosphor-icons/react/ssr`.** The root barrel calls
   `useContext` and breaks in server components. No `lucide-react` in new code.

2. **Local Supabase does not replicate hosted's default privileges.** Hosted grants
   anon/authenticated SELECT on new `public` tables; a local `supabase start` does not, so
   pre-existing tables throw "permission denied" locally. `supabase/seed.sql` closes the gap and is
   local-only (`db reset` applies it; `db push` does not). **New migrations must declare their
   GRANTs explicitly** so local and hosted behave identically — see 036 for the pattern.

3. **`npm run dev` and `npm run build` talk to different databases.** `.env.development.local`
   points dev at local Supabase; `next build` sets `NODE_ENV=production` and reads `.env.local`,
   which is the **hosted** project. Migrations 036–040 are not applied there yet, so a production
   build currently fails loudly on the marketing tables. That is intentional — see gotcha 8.

4. **Next 16 refuses to run two dev servers from one directory.** You cannot stand up a second
   server on another port to compare environments.

5. **`db/queries/**` flattens PostgREST errors** into `new Error(\`Failed to load…: ${message}\`)`,
   which destroys the structured `code`. Anything classifying errors must match message text too.
   See `isSchemaMissingError` in `src/lib/supabase/errors.ts` (it lived in
   `marketing-content.service.ts` until 2026-09-12).

6. **Any new `process.env.X` read must be provisioned in Terraform**, or
   `src/lib/__tests__/env-provisioning.test.ts` fails. Add it to `provisioned_env` in
   `infra/main.tf` with a matching variable in `infra/variables.tf`.

7. **The mocks contain at least one real bug.** `tmWords` translates by percentages that resolve
   against the whole stacked column, not one row, so the hero store-cycler renders a blank gap in
   the mock itself. Phase 0 fixed it with `--tm-word-h`; use `tm-words-window` / `tm-words` /
   `tm-word`, not the mock's markup. Assume other mock details may be wrong — check behaviour, not
   just appearance.

8. **Missing tables now fail loudly.** `isSchemaMissingError` rethrows `PGRST205`/`42P01` instead of
   degrading, so a deploy before migrations produces a red build rather than a silently half-empty
   page. Keep that property in anything new.

9. **Optional function parameters are a silent-failure trap.** `applyImageOverride` gated uploaded
   images on an optional `key` argument that four call sites didn't pass; uploads saved correctly
   and simply never appeared on six of eleven slots, with no error. Prefer data carried on the row
   over parameters callers can forget.

10. **Screenshot verification is unreliable in this harness.** The preview pane only reliably
    captures the top of a freshly-loaded page — scrolled content comes back blank. Verify below-fold
    content through the DOM (`read_page`, or JS reading `getBoundingClientRect` / computed styles)
    rather than concluding a section is broken.

11. **`cn()` silently drops `leading-*` when a font-size class is in the other argument.**
    tailwind-merge treats font-size and line-height as one conflict group, so
    `cn("leading-none", "text-sm")` keeps only `text-sm` and you get a 20px line-height
    where the mock says `font: 700 14px/1`. There is no warning and the layout is only a
    few pixels off, so it survives review. Keep size and leading together in the same
    string, size first (`"text-sm leading-none"`). This will recur on every ported mock —
    the mocks specify typography as `font: <weight> <size>/<leading>` throughout.

12. **`/app` IS gated — by `src/proxy.ts`, not `middleware.ts`.** Next 16 renamed the file,
    so searching for `middleware.ts` wrongly suggests there is no auth gate (§3 of this doc
    said so, and it was wrong). `proxy.ts` also carves out `/app/orders/new` and
    `/app/orders/review` as public for the quote flow. Do NOT add a second gate in a layout:
    it cannot see those carve-outs and will redirect signed-out visitors away from the
    public quote flow.

---

## 6. Definition of done

- `npm run typecheck` clean.
- `npm run lint` at exactly **9 pre-existing errors** — add none, don't fix unrelated ones.
- `npx vitest run` — **368 tests in 30 files** currently pass. Keep green, add yours.
- Each screen rendered in the browser and compared against its mock at `localhost:4321`.
- Mobile checked at 390px — it is specified per screen, not an afterthought.
- Animations actually firing, with the mock's own per-item delays.

**`CLAUDE.md` requires stopping for the user's approval after each feature.** Do not run Phase 2
end to end and present it finished — build, show, wait.

---

## 7. Open decisions to raise early

1. **`/faq`, `/contact`, `/policies`** still use the old design and `/faq` is in the new nav.
   Redesign now or later?
2. **Migrations 036–040 are not on the hosted database.** Nothing deploys until they are.
3. **Stage % and ETA have no real source.** The journey track needs either a per-stage timestamp
   model or an honest approximation. Don't invent precision the data doesn't support — raise it.
4. **Price watch needs a daily job.** Follow `src/app/api/cron/exchange-rates/route.ts` or use the
   `jobs` table; decide which before building.
5. **The sample product is an Oraimo BoomPop N**, but the mocks label it "Sony WH-1000XM5" across
   five screens. Still unresolved.

---

## 8. Logo swap — handed to this session (added 2026-09-12)

The brand logo changed. New artwork: an orange globe with a plane arcing over it
and a shipping container, plus a "tomame" wordmark and the tagline
"SHIPPING THE WORLD, DELIVERING TRUST".

**Use `<Logo>` from `@/components/brand/logo`.** Never render the wordmark as
text or CSS gradient again — that is what this component exists to stop. Four
variants:

| Variant | What it is | Use for |
|---|---|---|
| `horizontal` (default) | mark beside wordmark | navs, headers — the supplied artwork stacks vertically and will not fit a 64–76px bar |
| `wordmark` | lettering alone | where the mark would be too small to read |
| `mark` | globe + plane + container | tight square slots |
| `lockup` | the artwork as supplied, tagline included | footers, auth panels. Needs 100px+ height to be legible |

Size with the `height` prop (width follows the aspect ratio), and pass
`decorative` when the surrounding link already carries the label so a screen
reader does not announce "Tomame" twice.

**One gotcha, learned twice:** do not render one Logo per breakpoint with
`md:hidden` / `hidden md:block`. A hidden `next/image` still downloads, so that
pattern fetches the artwork twice. Use a single element and pick a height that
works at both sizes, or size it with `className`.

### What is already done

Marketing nav, marketing footer, marketing mobile menu, dashboard navbar, admin
sidebar, the design-system page, plus `src/app/{icon,apple-icon,opengraph-image}.png`
(the site had no favicon at all before).

### What is yours

1. **`src/components/layout/app/app-nav.tsx:76`** still uses the old
   `tm-wordmark` CSS gradient text. This is the Phase 2 app nav — it did not
   exist when the rest of the swap happened, which is why it was left. Replace
   with `<Logo variant="horizontal" height={22} decorative priority />` inside
   the existing home link.

2. **`src/app/auth/layout.tsx:19` and `:70`** render "Tomame" as white bold text
   on a rose→orange→amber gradient panel. **Do not drop the colour logo on it** —
   the black-and-orange artwork will not read against that background. This needs
   a white/mono version of the wordmark, which does not exist yet. Either leave
   the text until one is supplied, or reconsider the panel: the design handoff
   says no dark surfaces and black for text only, so that gradient panel is
   arguably off-brand now anyway.

3. **Once both are done**, `@utility tm-wordmark` in `src/app/globals.css` is
   dead and can go. It was left in place only because app-nav still used it.

`src/components/layout/main/*` (old navbar, mobile-menu, site-footer) is
unreferenced dead code from before Phase 1 and was deliberately not updated.

### Brand colour note

The logo's orange is `#F85000`; the design system's `--tm-coral` is `#F25B3D`.
RGB distance 62 — visibly different, not a rounding error. The decision was to
**keep the palette** and let the logo read as the one hotter element, rather than
retune a token that every button, link and gradient depends on. Do not "fix" this
without asking.

---

## 8. Phase 2 outcome (completed)

All five features shipped. Decisions D1–D6 were approved by the user before any code was written.

### Schema added
- **041** — `price_watches`, `price_observations`, `extraction_requests`, `notifications.read_at`.
- **042** — pg_cron schedule `recheck-price-watches`, daily 06:00 UTC, reusing the existing
  `CRON_SECRET` (already in `infra/main.tf:72` — no Terraform change was needed).

### Endpoints added
`GET /api/pricing/rate` · `GET/POST /api/watches` · `DELETE /api/watches/:id` ·
`GET /api/watches/:id/history` · `PATCH /api/notifications/:id/read` ·
`POST /api/notifications/read-all` · `GET /api/cron/price-watches`

### Deliberately NOT built (decisions, not omissions)
- **Bag count badge, "Add to bag", the freight box** — all need the cart/box entities from Phase 4.
  Stubbing them would have meant inventing "62% full · save GH₵96".
- **"Rate locked 24h" trust chip** — rate locks are Phase 3 (`quote_locks`). Two chips, not three.
- **"— or describe it"** in the paste placeholder — the extractor takes a URL and rejects free text.
- **The nav's bookmark button** — it led to the same place as the visible "Price watch" tab.

### Decisions worth not relitigating
- **Stage % is stage POSITION** (pending 5 / paid 20 / processing 40 / in_transit 75 / delivered 100),
  not progress through time. The five stops are drawn underneath it, which is what makes it honest.
- **ETA renders only when `estimated_delivery_date` is actually set**, and flips tense to "Landed"
  once delivered. Never an invented "Lands Sat".
- **Price-watch deltas are derived from `price_usd`, never GH₵.** `delta_ghs` carries both the price
  move and the FX move, so it can never be used to claim a price cut. Tests pin both directions.
- **The nightly job stamps `last_checked_at` on failure too**, or a dead URL parks at the head of the
  queue and eats the whole 200-watch budget every night.

### Bugs found and fixed along the way (none caused by the redesign)
1. `/api/products/extract` short-circuited on a cache hit **before** recording the paste, so ~half of
   all pastes would never have been logged, silently.
2. `orders/new/page.tsx` double-decoded `?url=` — `searchParams.get` already decodes, so a link
   containing `%` threw `URIError` and killed the quote screen; `%2B` silently became `+`.
3. The app nav and bottom tab bar both claimed `aria-label="Primary"`, exposing two identically
   named landmarks at mobile.
4. Signed-out visitors on the public quote routes were shown nav tabs and a wordmark that all led
   to a login redirect.

### Still open for a later phase
- `/faq`, `/contact`, `/policies` still use the old design, and `/faq` is linked from the new nav.
- Migrations 036–042 are **not on the hosted database**. Nothing deploys until they are.
- Five duplicate order-status label maps still exist; `src/features/orders/services/journey-stage.ts`
  is now the canonical one and they should collapse into it
  (`order-status-badge.tsx:4`, `deliveries/components/status-badge.tsx:4`,
  two `toolbar.tsx:29`, `order-status-timeline.tsx:8`).
- `notify_on_drop` is stored but nothing sends on it — the notification event vocabulary still needs
  price-drop, status-change and box-closing before the bell is genuinely useful. Note the nightly job
  already knows when a watch drops; it is the sending side that is missing.
- `price_watches.is_active` still carries two meanings (customer paused / job retired). `/app/watches`
  now separates them for display using `consecutive_failures > 0`, but a distinct `retired_at` column
  would be cleaner than inferring it.
- `useWatchHistory()` exists and is tested but has no UI; it would power a per-watch chart.
