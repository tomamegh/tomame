# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Tomame** is a concierge shopping platform for Ghanaian customers to purchase products from international e-commerce sites (USA, UK, China) using local payment methods (Mobile Money/Card) with managed delivery. Full pre-payment is required before any order processing begins.

The application is implemented under `src/` (Next.js App Router) with migrations under `supabase/migrations/`. The root markdown files are the design specs and remain authoritative for rules:
- `agent.md` — Authoritative architecture rules, security requirements, database schema, and folder structure
- `FEATURES.md` — Feature list organized by MVP Phase 1 vs Future Enhancements
- `system-flow.md` — Complete end-to-end system flow with visual diagrams
- `admin-setup.md` — Admin user creation procedures
- `password-management.md` — Password flows and implementation

## Tech Stack

- **Framework**: Next.js (App Router) with strict TypeScript
- **Auth**: Supabase Auth
- **Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **Payments**: Paystack (Mobile Money + Card), server-side only
- **Email**: Resend (transactional, default notification channel)
- **Notifications**: Email (default) + WhatsApp (optional)
- **Extraction**: hedged resolver race in `src/features/extraction/resolvers` driven by the store registry (`stores.ts`, one entry per store: domains, region, provider plan, status). Structured tiers — ScraperAPI (Amazon, eBay), Oxylabs (Amazon, Walmart), Zyte (any store) — start in order and hedge after 2 s; `category-map` (static maps → `store_category_map` → Haiku) starts as soon as title + price land; HTML tiers (direct → Zyte browser → Browserless; platform Cheerio → JSON-LD/OpenGraph) and the Claude page tier are fallbacks. Unknown hosts get the `generic` store. Never throws; partial products carry `messages`. See `docs/extraction-speed-plan.md` and `docs/extraction-pipeline-rework.md`.

## Expected Build Commands

Once the project is scaffolded:
```
npm run dev          # Development server
npm run build        # Production build
npm run lint         # ESLint + Prettier
npm run typecheck    # TypeScript strict mode check
npm test             # Run tests
npx tsx src/db/seeds/create-admin.ts  # Seed first admin user
```

## Required Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
PAYSTACK_SECRET_KEY
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
NEXT_PUBLIC_APP_URL
BROWSERLESS_API_KEY        # extraction: headless Chrome tier
ANTHROPIC_API_KEY          # extraction: Claude structured-extraction tier
EXCHANGE_RATE_API_KEY      # currency: primary provider
```
Optional (tier skipped when absent): `SCRAPERAPI_API_KEY` (Amazon + eBay), `OXYLABS_USERNAME` + `OXYLABS_PASSWORD` (Amazon weight, Walmart), `ZYTE_API_KEY` (any other store — recommended), `RAINFOREST_API_KEY`, `APIFY_API_TOKEN`, `FREECURRENCY_API_KEY`.

The quote flow (`/app/orders/new`, `/app/orders/review/[id]`, `/api/products/extract`, `/api/extractions/[id]`, `/api/pricing/preview`) is public; sign-in is required at order submission (`/api/orders/new`) and beyond.

## Development Workflow (Mandatory)

1. Implement features **one at a time** following the order in `FEATURES.md`
2. After completing each feature, **stop and ask** for user approval before proceeding
3. User must test and verify each feature before moving to the next
4. Never implement multiple unrelated features simultaneously
5. Never implement features not listed in `FEATURES.md` without discussion

## Architecture Rules

### Mandatory Folder Structure

```
src/
├── app/api/         # HTTP orchestration ONLY (auth, validation, response codes)
├── services/        # Business logic ONLY (no HTTP objects)
├── db/queries/      # Database access ONLY (no business logic)
├── lib/
│   ├── supabase/    # client.ts, server.ts, admin.ts (service role - NEVER in client code), types.ts
│   ├── email/       # resend.ts + templates/
│   ├── validators/
│   ├── rate-limit/
│   ├── logger/
│   └── env.ts       # Fail fast if required env vars missing
├── types/           # api.ts, db.ts, domain.ts
├── config/          # security.ts, constants.ts
└── middleware.ts
```

Violations of this layering are considered **architecture bugs**:
- `app/api/**` must NOT contain business logic
- `services/**` must NOT reference HTTP request/response objects
- `db/queries/**` must NOT contain business logic or auth checks
- `lib/supabase/admin.ts` must NEVER be imported in client code

### State Machine (Strict)

```
ORDERS:   pending_payment → paid → processing → in_transit → delivered
          pending_payment → cancelled (only if payment fails)

PAYMENTS: pending → success | failed

NOTIFICATIONS: pending → sent | failed (after 3 retries)
```

All state transitions must be server-side, explicit, validated against current state, and idempotent. Illegal transitions must be rejected.

## Security Rules (Non-Negotiable)

- **RLS on every table** — never disable to "make things work"
- **Server-only sensitive logic** — secrets, payment verification, money calculations must run in route handlers or server actions
- **Never trust the client** — no client-provided user_id, role, payment status, or price totals. Order creation prices from the server-side `extraction_cache` snapshot (`order-intake.service.ts`); the browser only sends identity, quantity and gap-fillers
- **Audit everything** — all mutations to payment status, order status, user roles, and job state must write to `audit_logs`
- **Paystack verification server-side only** — verify via `GET https://api.paystack.co/transaction/verify/:ref`
- **Webhook signature validation** — HMAC-SHA512 with `PAYSTACK_SECRET_KEY`
- Payment amounts are in **pesewas** (GHS × 100)
- `audit_logs` table is **append-only** — no UPDATE or DELETE operations ever

## Database Schema

**`supabase/migrations/` is the authority.** `agent.md`'s schema section describes
the pre-launch design and several of its tables no longer exist — do not build
from it.

RLS is enabled on every table. The ones the customer flow turns on:
- `profiles` (`profiles.id` references `auth.users(id)`), `orders`,
  `order_deliveries`, `payments`, `notifications`, `audit_logs`
- Pricing: `pricing_groups`, `pricing_constants`, `category_pricing_map`,
  `fixed_freight_items`, `exchange_rates` (migrations 027–032)
- Quotes and extraction: `extraction_cache` (product-keyed, shared),
  `extraction_requests` (who pasted what, and the paste queue's job state),
  `quote_locks`, `store_category_map`, `catalog_queries`, `catalog_products`
- Bag and pay (048): `carts`, `cart_items`, `consolidation_boxes`,
  `delivery_addresses`, `order_groups`
- Paste queue (049): `assisted_requests`, plus job columns on `extraction_requests`
- Marketing and content: `site_content`, `site_settings`, `regions`,
  `delivery_zones`, `policies`, `media_overrides`, `waitlist_signups`
- Watches: `price_watches`, `price_observations`; `job_budgets` caps vendor spend

`pricing_config` and `jobs` do NOT exist. `pricing_config` was dropped in
migration 021 and replaced by `pricing_groups` + `pricing_constants`; `jobs` was
never created — background work is pg_cron → pg_net → a Vercel route (see below).

## Pricing Calculation (Server-Side Only)

Every component except the item price is admin-controlled through
`pricing_groups` and `pricing_constants`, NOT a `pricing_config` table:

```
total_ghs = (item_price_usd + tax_usd + item_price_usd × value_fee_pct) × exchange_rate + freight_ghs
```

Freight is per item (× quantity) and takes one of four shapes: the group's flat
GHS rate, a fixed-freight item rate, a weight expression
`(max(weight_lbs, minimum_chargeable_weight_lbs) × quantity × freight_rate_per_lb + handling_fee_usd) × exchange_rate`,
or `needs_review` when the category cannot be priced. `src/lib/pricing/calculator.ts`
is the implementation and the only place these rules live.

A bag adds group-level money on `order_groups`: the consolidation saving
(`consolidation_saving_pct` of a box's freight, only from two lines up) and the
delivery fee (the chosen zone's `fee_ghs`, charged once per checkout).

## Background Jobs

pg_cron → pg_net → a Vercel route with `Bearer CRON_SECRET`. No workers, no
Vercel Cron, no queues. Jobs are small idempotent batches fired often (one vendor
call per run) because Vercel caps a function at 300 s. Follow
`run_catalog_scrape()` in migration 045: read the vault first and the GUC second,
and `raise warning` when `app_url` is unset — a function that reads only the GUC
installs cleanly on hosted Supabase and then silently never calls the app.

## MVP Phase 1 Exclusions

These are explicitly **out of scope** for Phase 1:
- Volumetric weight calculations
- Customer wallet functionality
- Mobile applications
- Advanced analytics
- AI/recommendation systems
- Multi-language support
