# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Tomame** is a concierge shopping platform for Ghanaian customers to purchase products from international e-commerce sites (USA, UK, China) using local payment methods (Mobile Money/Card) with managed delivery. Full pre-payment is required before any order processing begins.

This repository currently contains **design specifications only** — no source code has been implemented yet. All specs live in the root markdown files:
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
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
PAYSTACK_SECRET_KEY
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
NEXT_PUBLIC_APP_URL
```

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
- **Never trust the client** — no client-provided user_id, role, payment status, or price totals
- **Audit everything** — all mutations to payment status, order status, user roles, and job state must write to `audit_logs`
- **Paystack verification server-side only** — verify via `GET https://api.paystack.co/transaction/verify/:ref`
- **Webhook signature validation** — HMAC-SHA512 with `PAYSTACK_SECRET_KEY`
- Payment amounts are in **pesewas** (GHS × 100)
- `audit_logs` table is **append-only** — no UPDATE or DELETE operations ever

## Database Schema

Seven core tables (all with RLS enabled): `users`, `orders`, `payments`, `pricing_config`, `notifications`, `audit_logs`, `jobs`. The authoritative schema definitions with exact SQL and RLS policies are in `agent.md` (lines 319–556).

Key relationships:
- `users.id` references `auth.users(id)`
- `orders.payment_id` references `payments(id)`
- `pricing_config` is admin-only (controls shipping fees, exchange rates, service fee %)
- Pricing formula: `total_ghs = (item_price_usd + shipping_fee_usd + (item_price_usd × service_fee_pct)) × exchange_rate`

## Pricing Calculation (Server-Side Only)

All pricing components except item price are **admin-controlled** via `pricing_config` table:
- `base_shipping_fee_usd` per region (USA/UK/CHINA)
- `exchange_rate` per region
- `service_fee_percentage` (e.g., 0.10 = 10%)
- Item price estimate is user-provided

## MVP Phase 1 Exclusions

These are explicitly **out of scope** for Phase 1:
- Automated product price scraping
- Volumetric weight calculations
- Customer wallet functionality
- Mobile applications
- Advanced analytics
- AI/recommendation systems
- Multi-language support
