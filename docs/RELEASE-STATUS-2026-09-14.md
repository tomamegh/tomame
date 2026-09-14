# Release status, 2026-09-14 (evening)

**Shipped to production.** `main` was pushed at 05be23c and both Vercel projects
deployed. Local, dev and prod all carry migrations 059 to 062.

Production verified after the deploy: zero pending payments, orders and bags;
zero notifications sent; `reconcile-payments` and `sweep-extractions` both
recording healthy heartbeats; `/api/admin/ops` and `/api/cron/*` refusing
anonymous callers with 401.

Gates on the pushed commit, run in an isolated checkout so no in-flight work
could flatter them: typecheck 0, lint exactly 9 pre-existing errors, vitest 117
files / 1557 tests, build green.

## The five stuck payments

Cleared before the push, at the owner's instruction: they were test checkouts
and every one belonged to a Tomame account. Each payment is `failed` with
`voided_as_test_data` and a reason in its metadata, its order and bag cancelled,
and an audit row written naming it as test data. Voided rather than deleted, so
the history says what happened. This was done BEFORE the reconciliation job went
live, so the job never emailed a real person about a payment they were only
trying out.

## What shipped

### The money that never settled (059)

Paystack fires no webhook for an abandoned checkout and the browser callback
only runs if the customer returns to the tab. Prod's five pending payments were
never asked about. Now `reconcile-payments` (pg_cron, every five minutes,
`/api/cron/reconcile-payments`) verifies every pending payment older than five
minutes against Paystack:

- Paystack `success` or `failed`: settled or recorded through the same
  `handlePaymentCallback` path the webhook uses.
- Anything else, once older than `site_settings.payment_expiry_minutes`
  (default 60): released `pending -> failed` with `metadata.expired_at`, audit
  `payment_expired`, and an email "your payment did not go through, pay again".
- Orders and bags with no pending or successful payment for
  `site_settings.unpaid_order_ttl_hours` (default 48): cancelled, audited,
  a timeline line written, and an email sent.

A released payment can still turn into money (the customer reopens the
Paystack link). `handlePaymentCallback` moves such a row `failed -> success`
and, if its order is no longer pending, audits `needsRefundReview: true`. The
Health screen lists those.

Verified: 16 unit tests on the sweep and the late-payment path; the job has
run on hosted dev on its own schedule (heartbeat at 18:17 UTC).

### Observability (060)

- Every cron route goes through `runCronJob`: fails closed without
  `CRON_SECRET` (503), records a `job_heartbeats` row on every run.
- `ops_cron_schedule()` exposes pg_cron's view to the service role only.
- `/admin/ops` ("Health" in the sidebar) lists alarms first: payments pending
  past expiry, refund reviews, jobs pg_cron fires that the app never sees, stale
  jobs, unscheduled jobs (unapplied migrations), lingering or failed
  notifications, stuck paste jobs, spent vendor budgets. Then the figures.
  `/api/admin/ops` returns the same as JSON for an external monitor.
- No error-tracking vendor was added. Sentry or Datadog is Kelvin's call.

### Kelvin's three asks

- "Admin access required" on Mark as purchasing: `requireAdmin` tested the DB
  role and the service tested the JWT claim, which hosted never writes to
  `auth.users.raw_app_meta_data`. The claims are now merged into the server
  user and every admin decision goes through `canAccessAdmin`.
- Parcel photo and feedback on the admin order: the UI was missing, not
  misunderstood. Migration 054 shipped the routes and the customer side only.
  `/admin/orders/[id]` now has the photo panel (camera on phones, note,
  customer-visible toggle, delete) and the customer's feedback beneath it.
- Photo builder: launched from Content > Photo builder, one marketing page at a
  time, admin-only (404 to everyone else; the API refuses 401/403).

### Error tracking, free and without a vendor (062)

`logger.error` now also writes a grouped row to `error_events`, keyed by a
fingerprint of the normalised message and its source, so ten thousand
occurrences of one bug are one issue with a count and a first-seen time. The
writer redacts before it stores (secrets and anything naming a person dropped,
URLs reduced to host, long strings cut), never throws, never blocks the call
site, never recurses into the logger, and skips the database on the edge runtime
so the proxy bundle stays small. A hot loop costs at most one write per issue
per ten seconds, with skipped occurrences carried into the next write so the
count stays true. Retention is a pure-SQL nightly job: filed issues go after a
week, untouched ones after ninety days.

The Health screen lists open issues and an admin can file one. Filing is not
silencing: the next occurrence clears it and the issue returns, which is what
makes a regression loud.

Sentry's free tier remains the paid-later upgrade and needs Kelvin to create the
project; give me the DSN and it wires alongside this, not instead of it.

### Security review (061 and code)

Full write-ups: `docs/SECURITY-REVIEW-2026-09-14.md` (HTTP surface, all 90
routes tabulated) and `docs/SECURITY-REVIEW-2026-09-14-db.md` (RLS as a
customer, storage, dependencies).

Closed:

- **Critical.** `handle_new_user()` copied `raw_user_meta_data->>'role'` from
  the public signup call into `profiles.role`. Anyone could register as admin.
  Hosted dev and prod were checked: zero users ever sent a role claim; all
  admins are the known accounts. Trigger rewritten to hard-code `user`.
- **High.** Five cron trigger functions were callable by anon over RPC and
  fired the real routes with the real secret. EXECUTE revoked; default
  privileges changed so the next function is not exposed.
- **High.** Customers held INSERT/UPDATE/DELETE on `extraction_requests` and
  `price_watches` (unbounded vendor spend). Revoked; policies dropped; the app
  only ever wrote through the service role.
- **High (code).** `POST /api/orders` priced from the snapshot the client named
  and stored the URL the client named. The order's URL is now the snapshot's.
- **High (code).** A `needs_review` order was payable at the customer's typed
  price; only the UI hid the button. `initializePayment` now refuses until an
  admin has set `admin_total_ghs`.
- **Medium.** `TRUNCATE`, `TRIGGER`, `REFERENCES` revoked from the API roles on
  every table; the access-token hook is executable by `supabase_auth_admin` only.
- Customer cancel refuses while a Paystack charge is open on the order.

Closed after the push, in `abb7fd2` (on `main`, not yet deployed):

- **`/api/orders/:id/history` handed the customer raw `audit_logs`.** It now maps
  through a per-action metadata whitelist; an unrecognised action reaches the
  customer as its name and timestamp and nothing else, so widening the endpoint
  takes an edit to that list rather than a field added somewhere else. No actor
  ids, no `admin_pricing_note`, no rejection reasons. Note: its only consumer
  (`useOrderHistory` and `OrderStatusTimeline`) is dead code that nothing
  imports; the live timeline is `order_events`.
- **Anonymous cache-hit extracts were free.** They now spend their own looser
  bucket derived from the same rate-limit entry, so they are bounded without
  eating the tight budget that guards paid vendor calls.

Still open:

- The security headers, the image-proxy rate limit, the `/_next/image`
  open-proxy narrowing and the image-extension hole in the proxy matcher: in
  progress at the time of writing.
- The dependency upgrade is verified and ready but not merged: Next 16.3.5,
  Tailwind 4.3.3, postcss, sharp and undici, no source changes needed, all four
  gates green in an isolated worktree. Runtime advisories go from 1 critical and
  9 high to 0 critical and 5 high. Remaining after it: `xlsx` (no npm fix),
  `@tiptap/*`, and the eslint and build tooling chain. Next 16.3's dev server
  writes its own agent-rules block into `CLAUDE.md` unless `agentRules: false`
  is set, so that goes in with it.
- The rate limiter is still per Vercel instance.

## Decisions for Kelvin

1. **The voided test payments.** They are `failed` with a flag, not deleted. Say
   so if you would rather they were gone entirely.
2. **Sentry's free tier**, if you want a vendor alongside the built-in tracking.
   It needs you to create the project and hand over the DSN.
3. **The dead order-history timeline**: delete it, or wire it back in.
4. **A concurrent session is working in this same checkout.** Its uncommitted
   catalogue-search work sits in the tree, and its migration was numbered 062,
   which this session had already applied to local, dev and prod as
   `error_events`. Applying it would have been silently skipped as an
   already-recorded version. Renamed to 063; the contents are untouched.
5. **First-run tour (handoff section 3).** Deferred to the next session at your
   request; it still needs the four decisions the handoff lists (what it points
   at, when it fires, the dismissed flag, signed-out visitors).
6. **PITR is still off on production** and there are no platform backups.
