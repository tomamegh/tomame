# Agent Instructions – Secure Next.js Backend with Supabase

## Role
You are a senior backend engineer building a production-grade backend using **Next.js (App Router)** and **Supabase**.
Security, correctness, and long-term maintainability take priority over speed or convenience.

Assume this system may later scale to high traffic and sensitive payment-related workflows.

---

## Development Workflow (MANDATORY)

### Feature Implementation Process

**CRITICAL: You MUST follow this workflow for ALL feature implementations:**

1. **Reference FEATURES.md**
   - All features are defined in `FEATURES.md`
   - Features are organized by priority (MVP Phase 1 vs Future)
   - Follow the exact order and grouping specified

2. **One Feature at a Time**
   - Implement ONE feature or feature group at a time
   - Complete the feature fully before moving to the next
   - Do NOT skip ahead or implement multiple unrelated features

3. **Wait for Approval**
   - After completing a feature, STOP and inform the user
   - Provide a summary of what was implemented
   - List the files created/modified
   - **ALWAYS ask: "Should I proceed to the next feature?"**
   - Wait for explicit user confirmation before continuing

4. **User Verification Required**
   - User will test and verify each completed feature
   - User may request changes or fixes
   - Only proceed to next feature after user approval

5. **Track Progress**
   - Keep mental note of completed features
   - Reference FEATURES.md to know what's next
   - If user asks "what's next?", refer to FEATURES.md

### Example Workflow

```
Agent: "I've completed Feature 1: User Registration and Login.

Files created:
- app/api/auth/signup/route.ts
- app/api/auth/login/route.ts
- lib/auth/auth.service.ts

Should I proceed to the next feature (Email Verification)?"

User: "Yes, proceed"

Agent: [Implements email verification]
```

### Forbidden Practices

- ❌ Implementing multiple features without asking
- ❌ Skipping features in FEATURES.md
- ❌ Moving to next feature without user approval
- ❌ Implementing features not in FEATURES.md without discussion
- ❌ Assuming user has tested without confirmation

---

## Core Stack
- **Framework**: Next.js (App Router)
- **Runtime**: Node.js (Server-only APIs)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Payments**: Paystack (server-side only)
- **Email**: SendGrid (transactional emails)
- **Hosting**: Serverless or containerized (assume stateless execution)

---

## Fundamental Security Rules (Non-Negotiable)

### 1. Server-Only Execution
- Never expose secrets to the client
- All sensitive logic MUST run in:
  - Server Actions
  - Route Handlers (`app/api/**/route.ts`)
- Never place secrets in:
  - Client Components
  - Public environment variables
  - Browser-executed code

### 2. Environment Variables
- Use `process.env` only on the server
- Prefix public variables with `NEXT_PUBLIC_` ONLY if explicitly safe
- Never log environment variables
- Fail fast if required env vars are missing

### 3. Authentication & Authorization
- Use Supabase Auth for user identity
- Every request that mutates or reads sensitive data MUST:
  - Validate the authenticated user
  - Enforce authorization checks
- Never trust client-provided user IDs
- Always derive identity from Supabase session or JWT

---

## Supabase Usage Rules

### 4. Row Level Security (RLS)
- RLS MUST be enabled on all tables
- Never disable RLS to "make things work"
- Policies must enforce:
  - User ownership
  - Role-based access where applicable
- Database security is mandatory even if API validation exists

### 5. Database Access Patterns
- Prefer server-side Supabase clients
- Avoid exposing Supabase anon keys in frontend logic for sensitive tables
- Use service role key ONLY in trusted server contexts

### 6. Data Validation
- Validate all inputs at API boundaries
- Do not rely on frontend validation
- Reject unexpected or malformed input early
- Sanitize external data (especially scraped content)

---

## API & Route Handler Standards

### 7. API Design
- Use REST-style route handlers
- Return explicit HTTP status codes
- Never leak stack traces or internal errors
- Use structured error responses

### 8. Rate Limiting & Abuse Protection
- Assume endpoints may be abused
- Implement basic rate limiting or throttling logic where applicable
- Do not expose scraping or processing endpoints publicly without protection

---

## Payments (Paystack)

### 9. Payment Security
- Payment initialization and verification MUST be server-side
- Never trust payment status from the client
- Always verify transactions using Paystack's API
- Never store card or sensitive payment data
- Persist only:
  - Transaction reference
  - Status
  - Amount
  - Metadata

---

## Background Processing & Long Tasks

### 10. Execution Constraints
- Do not block request/response cycles with long tasks
- For heavy processing:
  - Trigger async jobs
  - Store job state in the database
- Design APIs to be resumable and idempotent

---

## Logging & Observability

### 11. Logging Rules
- Log security-relevant events:
  - Auth failures
  - Payment verification failures
  - Unexpected state transitions
- Never log:
  - Tokens
  - Secrets
  - Personal data
- Prefer structured logs over console spam

---

## Error Handling

### 12. Error Discipline
- Fail explicitly and safely
- Return user-safe messages
- Internal errors should be abstracted
- Never expose database errors directly

---

## Code Quality & Architecture

### 13. Separation of Concerns
- API handlers: request/response orchestration only
- Business logic: isolated service functions
- Database logic: isolated query layer
- No "god files"

### 14. Type Safety
- Use strict TypeScript
- Avoid `any`
- Prefer explicit return types for public functions

---

## Scraping-Adjacent Constraints

### 15. External Data Safety
- Treat all external data as untrusted
- Normalize and validate before persistence
- Avoid synchronous scraping inside request handlers
- Design scraping hooks as internal-only APIs

---

## Forbidden Practices
- ❌ Disabling Supabase RLS
- ❌ Client-side payment verification
- ❌ Hardcoding secrets
- ❌ Silent failure handling
- ❌ Skipping authorization checks
- ❌ Using Supabase service role in the browser

---

## Decision Guideline
If there is a trade-off between:
- Speed vs security → **choose security**
- Convenience vs correctness → **choose correctness**
- MVP hacks vs future stability → **choose stability**

---

## Mandatory Project Folder Structure

The project uses a **feature-module** architecture.
Each domain feature (auth, users, orders, payments, etc.) is self-contained in its own directory under `src/features/`.
Shared infrastructure lives in `src/lib/`. Route handlers in `src/app/api/` are thin — they call into feature modules.

Do not invent alternative layouts.
Do not place business logic inside route handlers.
Do not collapse layers for convenience.

```
src/
├── app/
│   ├── api/                        # Thin HTTP route handlers ONLY
│   │   ├── auth/
│   │   │   ├── signup/route.ts
│   │   │   ├── login/route.ts
│   │   │   ├── forgot-password/route.ts
│   │   │   ├── reset-password/route.ts
│   │   │   └── change-password/route.ts
│   │   ├── admin/
│   │   │   └── users/
│   │   │       ├── promote/route.ts
│   │   │       ├── create-admin/route.ts
│   │   │       └── reset-password/route.ts
│   │   ├── orders/
│   │   ├── payments/
│   │   ├── webhooks/
│   │   └── health/route.ts
│   │
│   ├── (public)/
│   ├── (dashboard)/
│   ├── layout.tsx
│   └── globals.css
│
├── features/                       # Self-contained feature modules
│   ├── auth/                       # Authentication (signup, login, password flows)
│   │   ├── auth.service.ts
│   │   └── auth.validators.ts
│   │
│   ├── users/                      # User management (CRUD, admin operations)
│   │   ├── users.service.ts
│   │   ├── users.queries.ts
│   │   └── users.validators.ts
│   │
│   ├── audit/                      # Audit logging (append-only trail)
│   │   ├── audit.service.ts
│   │   └── audit.queries.ts
│   │
│   ├── orders/                     # Order lifecycle management
│   │   ├── orders.service.ts
│   │   ├── orders.queries.ts
│   │   └── orders.validators.ts
│   │
│   ├── payments/                   # Paystack payment processing
│   │   ├── payments.service.ts
│   │   ├── payments.queries.ts
│   │   └── payments.validators.ts
│   │
│   ├── pricing/                    # Admin-controlled pricing config
│   │   ├── pricing.service.ts
│   │   ├── pricing.queries.ts
│   │   └── pricing.validators.ts
│   │
│   └── notifications/              # Email/WhatsApp notification system
│       ├── notifications.service.ts
│       ├── notifications.queries.ts
│       └── notifications.validators.ts
│
├── lib/                            # Shared infrastructure (NOT feature-specific)
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   ├── admin.ts
│   │   └── types.ts
│   ├── auth/                       # Shared auth utilities (session, guards, response helpers)
│   │   ├── session.ts
│   │   ├── guards.ts
│   │   └── api-helpers.ts
│   ├── email/
│   │   ├── sendgrid.ts
│   │   └── templates/
│   ├── rate-limit/
│   ├── logger/
│   └── env.ts
│
├── types/                          # Shared cross-cutting types
│   ├── api.ts
│   ├── db.ts
│   └── domain.ts
│
├── config/
│   ├── security.ts
│   └── constants.ts
│
├── db/
│   ├── migrations/
│   └── seeds/
│
└── middleware.ts
```

### Feature Module Rules

Each feature directory (`src/features/<name>/`) contains:
- **`<name>.service.ts`** — Business logic. Must NOT reference HTTP request/response objects.
- **`<name>.queries.ts`** — Database access. Must NOT contain business logic or auth checks. All functions accept a Supabase client parameter.
- **`<name>.validators.ts`** — Zod schemas for input validation.
- Additional files as needed (e.g. `<name>.types.ts` for feature-specific types).

Features MAY import from other features (e.g. `auth` imports from `users` and `audit`).
Features MUST NOT import from `app/api/` route handlers.

---

## Architectural Enforcement Rules

- **`app/api/**`**: HTTP orchestration only (rate limit, validate, authenticate, call feature service, respond)
- **`features/**/service.ts`**: Business rules and workflows. Must NOT reference HTTP objects
- **`features/**/queries.ts`**: Database access only. No business logic or auth checks
- **`lib/supabase/admin.ts`**: Service role access only. Must NEVER be imported in client code
- **`lib/auth/**`**: Shared auth utilities (session loading, guards, response formatting)
- **`types/**`**: Cross-cutting types shared across multiple features

Violations of this structure are considered **architecture bugs**.

---

## Canonical Database Schema (Supabase / PostgreSQL)

The following tables define the **authoritative MVP schema**.
Do NOT invent new tables or modify existing ones without explicit instruction.
All tables MUST have Row Level Security (RLS) enabled.

### payments

Purpose: Stores Paystack payment intents and verified transactions. Payment status is **server-controlled only**.

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  reference TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own payments"
ON payments FOR SELECT
USING (auth.uid() = user_id);
```

### orders

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  payment_id UUID REFERENCES payments(id),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'paid', 'processing', 'completed', 'cancelled')
  ),
  product_url TEXT NOT NULL,
  pricing JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own orders"
ON orders FOR SELECT
USING (auth.uid() = user_id);
```

### jobs

```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'running', 'completed', 'failed')
  ),
  payload JSONB NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
```

### users

Purpose: Stores application-level user metadata and role mapping. This table mirrors Supabase Auth users but is owned by the application.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own profile"
ON users FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "admins can read all users"
ON users FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);
```

### Admin Policies

```sql
CREATE POLICY "admins can read all payments"
ON payments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND users.role = 'admin'
  )
);

CREATE POLICY "admins can read all orders"
ON orders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND users.role = 'admin'
  )
);
```

---

## Order → Payment State Machine (Authoritative)

Order and payment state transitions MUST follow this state machine.
Any deviation is a logic bug.

### Payment States

```
pending → success
pending → failed
```

1. `pending` is created before redirect to Paystack
2. `success` ONLY after server-side verification
3. `failed` ONLY after verification failure or timeout

### Order States

```
pending → paid → processing → completed
pending → cancelled
```

### Transition Rules

1. **orders.status = 'paid'**
   - Allowed ONLY if:
     - Linked payment exists
     - payments.status = 'success'

2. **orders.status = 'processing'**
   - Allowed ONLY if:
     - Order is already paid

3. **orders.status = 'completed'**
   - Allowed ONLY if:
     - Order is processing

4. **orders.status = 'cancelled'**
   - Allowed ONLY if:
     - Order is pending
     - Payment has NOT succeeded

### State Enforcement Rules

- Clients CANNOT update:
  - `payments.status`
  - `orders.status`
- All state transitions MUST be:
  - Server-side
  - Explicit
  - Validated against current state
- State transitions MUST be idempotent
- Illegal transitions MUST be rejected

---

## Authorization Enforcement Rule

Every protected API route MUST:
1. Authenticate the user
2. Load the user record from `users`
3. Enforce role-based access explicitly

Skipping role checks is considered a security defect.

---

## Forbidden Practices (Expanded)

- ❌ Inferring roles from email domain
- ❌ Trusting client-provided role or user_id
- ❌ Client-side updates to payments or orders
- ❌ Manual overrides of payment status
- ❌ Disabling RLS to "fix" access issues
- ❌ Encoding business roles in frontend logic

---

## Migration & Integrity Rules

- Schema changes require migrations
- Role changes require auditability
- Payments and orders are append-only in spirit
- Historical financial data MUST NOT be deleted

---

## Audit Logging (Mandatory)

### audit_logs

Purpose: Provides an immutable audit trail for all security-sensitive and business-critical actions. Audit logs are append-only and MUST NEVER be modified or deleted.

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('user', 'admin', 'system')),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can read audit logs"
ON audit_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND users.role = 'admin'
  )
);
```

### Rules

- Audit logs are append-only
- UPDATE and DELETE operations are forbidden
- Only server-side code may insert audit logs
- Clients may NEVER read audit logs
- Admins may read audit logs for investigation only

### Audit Events (Required)

Audit logs MUST be recorded for the following actions:

**1. Authentication & Authorization**
- User account creation
- Role assignment or change
- Admin privilege usage
- Authorization failures

**2. Payments**
- Payment initialization
- Payment verification success
- Payment verification failure
- Webhook receipt and validation result

**3. Orders**
- Order creation
- Order state transition
- Order cancellation

**4. Jobs & Background Processing**
- Job creation
- Job failure
- Job completion

### Audit Log Writing Rules

- Audit logs MUST be written in the same transaction as the action when possible
- Audit logging failures MUST NOT block core business flows
- Metadata should include:
  - Previous state
  - New state
  - External references (e.g., payment reference)
- Do NOT store secrets or personal data in audit logs

### Audit Log Schema Usage Rules

- `actor_id` may be NULL for system-initiated actions
- `actor_role = 'system'` is required for background jobs and webhooks
- `entity_type` MUST be one of: `'user'`, `'payment'`, `'order'`, `'job'`
- `action` MUST be explicit and human-readable

### Audit Enforcement Rule

Any code that mutates:
- payment status
- order status
- user roles
- job state

MUST write a corresponding audit log entry.

Missing audit logs are considered a compliance defect.

---

## Notifications Specification (Email & WhatsApp)

**Email via SendGrid is the default notification channel.**
WhatsApp is optional and event-specific.

Notifications are informational side-effects and MUST NOT drive business logic.

### Purpose

The notification system exists to:
- Inform users about payment and order events
- Use **SendGrid Email as the default delivery channel**
- Optionally support WhatsApp delivery via WhatsApp Business API or Twilio
- Provide reliable, auditable, idempotent delivery

Notifications MUST NOT:
- Trigger payments or order transitions
- Act as a source of truth
- Block core business workflows

### Default Channel Rule

- **SendGrid Email is the default notification channel**
- WhatsApp notifications MUST be explicitly enabled per event
- If no channel is specified, the system MUST use `email`
- WhatsApp MUST NOT replace email for critical events (payments, orders)

### SendGrid Configuration

**Environment Variables (Required):**
```
SENDGRID_API_KEY=<api_key>
SENDGRID_FROM_EMAIL=<verified_sender_email>
SENDGRID_FROM_NAME=<sender_name>
```

**Security Rules:**
- SendGrid API key MUST be server-side only
- Never expose SendGrid credentials to client
- Use environment variable validation on startup
- Fail fast if SendGrid config is missing

**Implementation Location:**
- `lib/email/sendgrid.ts` - SendGrid client wrapper
- `services/notifications.service.ts` - Business logic for email composition
- Email templates should be stored in `lib/email/templates/`

**Email Delivery Rules:**
- All emails MUST be sent asynchronously
- Email failures MUST NOT block business workflows
- Failed emails MUST be logged and retried (bounded retries)
- Email delivery status MUST be tracked in notifications table

### Database Schema

#### notifications

Purpose: Stores user-facing notifications and delivery status. Implements an outbox pattern.

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'whatsapp')),
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);
```

### RLS Rules

- Clients may ONLY read their own notifications
- Clients may NEVER insert, update, or delete notifications
- Server-side code is responsible for all writes
- Admins have read-only visibility across users

### Notification Events

Notifications MUST be created for the following events:

**Payment Events (Email REQUIRED)**
- `payment_initialized`
- `payment_successful`
- `payment_failed`

**Order Events (Email REQUIRED)**
- `order_created`
- `order_paid`
- `order_processing`
- `order_completed`
- `order_cancelled`

**System Events (Email DEFAULT)**
- `admin_action` (optional, internal)

**WhatsApp MAY be enabled for:**
- `payment_successful`
- `order_processing`
- `order_completed`

### Notification Creation Rules

- Email notifications MUST be created by default
- WhatsApp notifications MUST be explicitly opted-in per event
- Notifications MUST be persisted before delivery
- Creation MUST occur in the same logical flow as the triggering event
- Notification creation failures MUST NOT block core workflows
- Notification payloads MUST be derived from trusted database state

### Delivery Model (Outbox Pattern)

1. Business event occurs (payment, order transition)
2. Notification record is inserted with:
   - `channel = 'email'` (default)
   - `status = 'pending'`
3. Delivery worker processes pending notifications via SendGrid
4. Status is updated to `sent` or `failed`
5. SendGrid webhook updates delivery status (optional)

Delivery MUST be asynchronous.

**SendGrid Integration:**
- Use SendGrid's transactional email API
- Implement retry logic for failed sends (max 3 attempts)
- Log SendGrid response codes and message IDs
- Track email opens/clicks via SendGrid webhooks (optional)

### Safety & Compliance Rules

Notifications MUST NOT include:
- Secrets
- Tokens
- Internal identifiers
- Sensitive payment details

Additional rules:
- Email notifications are mandatory for financial events
- Notification delivery MUST be idempotent
- Delivery retries MUST be bounded
- Notification success MUST NOT be treated as proof of business success

---

## Project Overview

This application allows users in Ghana to request **price and shipping estimates (quotes)** for products from international e-commerce platforms (e.g. eBay, Amazon, AliExpress).

Users submit a product link, the system scrapes product details asynchronously, **admins define shipping fees and exchange rates**, and users decide whether to proceed with payment **after reviewing the quote**.

The system is built with **Next.js (App Router)** and **Supabase** and follows strict security, auditability, and separation-of-concerns principles.

---

## Core Principles (NON-NEGOTIABLE)

1. **Full pre-payment is required before order processing** (per contract)
2. Pricing is **admin-configurable** and displayed upfront
3. Shipping fees and Cedi exchange rates are **ADMIN-ONLY**
4. No automated scraping in MVP Phase 1 (manual entry only)
5. All side effects are asynchronous
6. Frontend never calculates money
7. Every critical action is auditable
8. Customers can track order status from submission to delivery

---

## Technology Stack

- **Frontend / Backend**: Next.js (App Router)
- **Auth**: Supabase Auth
- **Database**: Supabase Postgres + RLS
- **Async Jobs**: Cron-based workers (Next.js API routes)
- **Email**: SendGrid (transactional emails)
- **Notifications**: Email (SendGrid) + WhatsApp (optional)
- **Payments**: Paystack
- **Scraping**: Server-side only

---

## Folder Structure (Next.js + Supabase)

```
src/
  app/
    api/                          # Thin route handlers → call features
      auth/
        signup/route.ts
        login/route.ts
        forgot-password/route.ts
        reset-password/route.ts
        change-password/route.ts
      admin/
        users/
          promote/route.ts
          create-admin/route.ts
          reset-password/route.ts
      orders/
      payments/
      webhooks/
      health/route.ts
    (auth)/                       # Frontend pages (auth flows)
      login/
      signup/
      forgot-password/
      reset-password/
    dashboard/
    admin/
    settings/
      change-password/

  features/                       # Self-contained feature modules
    auth/                         # Authentication flows
    users/                        # User CRUD + admin management
    audit/                        # Audit logging
    orders/                       # Order lifecycle
    payments/                     # Paystack integration
    pricing/                      # Admin pricing config
    notifications/                # Email/WhatsApp delivery

  lib/                            # Shared infrastructure
    supabase/
    auth/                         # session.ts, guards.ts, api-helpers.ts
    email/
      sendgrid.ts
      templates/
    rate-limit/
    logger/
    env.ts

  types/                          # Shared cross-cutting types
  config/                         # security.ts, constants.ts
  db/
    migrations/
    seeds/
  middleware.ts
```

---

## High-Level User Flow

```
User submits product link
→ System calculates price (using admin-configured rates)
→ User sees total price
→ User pays (FULL PRE-PAYMENT)
→ Admin processes order manually
→ Customer tracks order status
```

**Contract Requirement**: Full pre-payment is mandatory before order processing begins.

---

## Order Lifecycle (State Machine)

```
pending_payment
→ paid
→ processing
→ in_transit
→ delivered
→ cancelled (only if payment fails)
```

**Key Rule**: Orders cannot enter 'processing' state without successful payment.

---

## Job Lifecycle

```
queued → running → completed | failed
```

**Job Types:**
- `send_notification`: Deliver email/WhatsApp notifications

---

## Step-by-Step Logic

### 1. Product Link Submission

- User submits product URL via validated form
- User manually provides product details (name, image URL, estimated price)
- System validates URL format and domain
- Order is created with status `pending_payment`
- System retrieves admin-configured pricing rates

**Form Fields:**
- Product URL (required)
- Product Name (required)
- Product Image URL (optional - user pastes image link)
- Estimated Price in USD (required)
- Quantity (default: 1)
- Origin Country (dropdown: USA/UK/CHINA)
- Special Instructions (optional)

**No Automated Scraping:**
- User must provide all required details manually
- Admin can edit/update details later if needed
- Keeps MVP simple and contract-compliant

```
User → Product Link + Details → Pricing Calculation → Payment
```

### 2. Dynamic Pricing Calculation (Server-Side)

**MVP Phase 1**: Admin manually configures ALL pricing components:
- Base shipping rates by region (USA, UK, China)
- Exchange rates (USD/GHS, GBP/GHS, CNY/GHS)
- **Service fee percentage** (e.g., 10% of item price)

System calculates total using admin-configured rates:
```
total_cost_ghs = (estimated_item_price_usd + shipping_fee_usd + service_fee_usd) × exchange_rate_ghs

Where:
- estimated_item_price_usd = user provides
- shipping_fee_usd = admin configures per region
- service_fee_usd = estimated_item_price_usd × service_fee_percentage (admin configures)
- exchange_rate_ghs = admin configures per region
```

**Pricing Components (Admin-Controlled):**
- ✅ Shipping fee (admin sets per region)
- ✅ Exchange rate (admin updates regularly)
- ✅ **Service fee percentage** (admin configures - e.g., 10%)
- ❌ Item price estimate (user provides)

**Example Calculation:**
```
User provides: $50 item price
Admin config (USA):
  - Shipping: $25
  - Service fee: 10%
  - Exchange rate: 15.5 GHS/USD

Calculation:
  Item: $50
  Shipping: $25
  Service fee: $50 × 10% = $5
  Subtotal: $80
  Total in GHS: $80 × 15.5 = GHS 1,240
```

### 3. Payment (FULL PRE-PAYMENT REQUIRED)

> **Contract Requirement**: Full pre-payment is mandatory before order processing

- User sees total price breakdown
- User initiates payment via Paystack (MoMo or Card)
- Payment is verified server-side
- On successful payment:
  - Order status → `paid`
  - Payment record created
  - Customer notification sent (Email + WhatsApp)
  - Admin notification sent

**No order processing begins until payment is confirmed.**

### 4. Order Processing (Admin-Driven)

- Admin reviews paid order
- Admin manually:
  - Purchases item from international platform
  - Arranges shipping
  - Updates order status through lifecycle
- Customer receives status update notifications

### 5. Order Tracking

- Customer can track order status in real-time
- Status updates:
  - `paid` - Payment received
  - `processing` - Item being purchased
  - `in_transit` - Item shipped to Ghana
  - `delivered` - Item delivered to customer

### 6. Notifications (Automated)

- Email + WhatsApp notifications sent at each status change
- Notifications include:
  - Order reference
  - Product name and image (if available)
  - Current status
  - Estimated delivery date (if applicable)
  - Tracking information (if available)

---

## Database Tables (Key)

### users

```sql
id UUID PRIMARY KEY
email TEXT UNIQUE
role ENUM ('user', 'admin')
created_at TIMESTAMPTZ
```

### orders

```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES users(id)
product_url TEXT NOT NULL
product_name TEXT
product_image_url TEXT
estimated_price_usd NUMERIC
quantity INTEGER DEFAULT 1
origin_country TEXT CHECK (origin_country IN ('USA', 'UK', 'CHINA'))
special_instructions TEXT
status order_status_enum
pricing_details JSONB
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**Fields:**
- `product_image_url`: URL to product image (user provides manually)
- `product_name`: Product title/description (user provides)
- `estimated_price_usd`: User-provided estimate (required)
- `quantity`: Number of items
- `origin_country`: USA, UK, or CHINA (determines pricing)
- `special_instructions`: Color, size, notes
- `pricing_details`: Stores calculated pricing breakdown (JSONB)

### pricing_config (ADMIN-CONTROLLED)

```sql
id UUID PRIMARY KEY
region TEXT NOT NULL CHECK (region IN ('USA', 'UK', 'CHINA'))
base_shipping_fee_usd NUMERIC NOT NULL
exchange_rate NUMERIC NOT NULL
service_fee_percentage NUMERIC DEFAULT 0
last_updated TIMESTAMPTZ DEFAULT now()
updated_by UUID REFERENCES users(id)
```

**Purpose**: Admin-configurable pricing that applies to all orders.

**Admin Controls:**
- ✅ `base_shipping_fee_usd`: Shipping cost per region (admin sets)
- ✅ `exchange_rate`: Currency conversion rate (admin updates regularly)
- ✅ `service_fee_percentage`: Percentage fee on item price (admin configures - e.g., 0.10 = 10%)

**Rules:**
- Only admins can update pricing_config
- Exchange rates should be updated regularly
- Service fee is calculated as: item_price × service_fee_percentage
- All pricing changes are audited

### payments

```sql
id UUID PRIMARY KEY
order_id UUID REFERENCES orders(id)
amount_ghs NUMERIC
status ENUM ('pending', 'success', 'failed')
provider TEXT
created_at TIMESTAMPTZ
```

### notifications

```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES users(id)
event TEXT
channel ENUM ('email')
status ENUM ('pending', 'sent', 'failed')
created_at TIMESTAMPTZ
```

### audit_logs (MANDATORY)

```sql
id UUID PRIMARY KEY
actor_id UUID
actor_role ENUM ('user', 'admin', 'system')
action TEXT
entity_type TEXT
entity_id UUID
created_at TIMESTAMPTZ
```

---

## Authorization & RLS Rules

**Users can:**
- Read their own orders
- Read their own quotes
- Change their own password
- Request password reset

**Users cannot:**
- Modify quotes
- Set shipping fees
- Set exchange rates
- Trigger scraping
- Access other users' data

**Admins can:**
- Set shipping fees
- Set exchange rates
- Finalize quotes
- View all orders and users
- Promote users to admin
- Create new admin users
- Reset user passwords
- Change their own password

All admin actions **must** create audit logs.

---

## Notifications Policy

- Default channel: **SendGrid Email**
- Notifications are:
  - Stored first in database
  - Sent asynchronously via background worker
- No email is sent inline during business logic execution
- SendGrid handles email delivery and tracking
- WhatsApp delivery via WhatsApp Business API or Twilio (optional)

---

## Abuse Prevention

- Rate-limit quote requests per user
- Domain allowlist for scraping
- CAPTCHA on quote submission
- Quote expiration enforced
- One active job per order

---

## What Agents MUST NOT Do

- ❌ Calculate money on the frontend
- ❌ Allow users to set shipping or FX rates
- ❌ Implement automated scraping in MVP Phase 1 (out of scope per contract)
- ❌ Allow order processing without confirmed payment
- ❌ Skip audit logging
- ❌ Trust client-provided totals
- ❌ Store card data (Paystack handles this)
- ❌ Process orders before full pre-payment

---

## Final Mental Model

```
Submit product link
→ See calculated price (using admin rates)
→ Pay full amount upfront
→ Admin processes order manually
→ Customer tracks delivery
```

This flow is **secure, auditable, scalable, and contract-compliant**.

---

## Contract Compliance (Schedule A)

**Key Requirements from Development Agreement:**

1. ✅ Full pre-payment required before processing
2. ✅ Pricing configurable by admin without code changes
3. ✅ Order lifecycle tracking from submission to delivery
4. ✅ Automated notifications (Email + WhatsApp)
5. ✅ Paystack integration (MoMo + Card)
6. ✅ Admin dashboard for order management
7. ✅ No automated scraping in Phase 1 (excluded per contract)
8. ✅ SSL enabled, no card data storage
9. ✅ Role-based admin access
10. ✅ Mobile responsive (page load < 3s)
11. ✅ Password reset and change functionality
12. ✅ Admin user management capabilities

**Explicit Exclusions (Phase 1):**
- ❌ Automated product price scraping
- ❌ Volumetric weight calculations
- ❌ Customer wallet functionality
- ❌ Mobile applications
- ❌ Advanced analytics dashboards
- ❌ AI/recommendation systems
- ❌ Multi-language support

---

## Password Management

### User Password Management

**Forgot Password Flow:**
1. User clicks "Forgot Password?" on login page
2. Enters email address
3. Receives password reset email (Supabase Auth)
4. Clicks reset link (expires in 1 hour)
5. Sets new password
6. Redirected to login

**Change Password Flow (Logged In):**
1. User navigates to Settings → Change Password
2. Enters new password and confirmation
3. Password updated via Supabase Auth
4. Success message displayed

### Admin Password Management

**Admin Can:**
- Change their own password (same as users)
- Send password reset emails to any user
- All password reset actions are audited

**Security Features:**
- ✅ Rate limiting (prevents brute force)
- ✅ Reset links expire in 1 hour
- ✅ One-time use tokens
- ✅ Minimum 8 characters
- ✅ Secure token generation
- ✅ Email verification required

**Implementation:**
- Handled by Supabase Auth (built-in security)
- No custom password storage
- All operations are server-side
- Audit logs for admin-initiated resets

**API Endpoints:**
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Set new password
- `POST /api/auth/change-password` - Change password (authenticated)
- `POST /api/admin/users/reset-password` - Admin reset user password

---

## Admin User Management

### Creating First Admin

**Option 1: Database Direct Insert (Recommended)**
1. Create user in Supabase Auth Dashboard
2. Run SQL to set role = 'admin'
3. Create audit log entry

**Option 2: Seed Script (Development)**
1. Run seed script with service role key
2. Creates admin user automatically

### Adding More Admins

**Method 1: Promote Existing User**
- Admin finds user in user management panel
- Clicks "Promote to Admin"
- User role changes from 'user' to 'admin'
- Action is audited

**Method 2: Create New Admin**
- Admin clicks "Create Admin" in admin panel
- Enters email and temporary password
- New admin user created with role = 'admin'
- New admin receives email with credentials

**API Endpoints:**
- `POST /api/admin/users/promote` - Promote user to admin
- `POST /api/admin/users/create-admin` - Create new admin user

**Security:**
- Only existing admins can create/promote admins
- All admin role changes are audited
- Service role key never exposed to client
- RLS policies prevent unauthorized role changes

---

Always assume this MVP may evolve into a long-term production system.

