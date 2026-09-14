# Release status, 2026-09-14 (evening)

Local `main` is at e34d002, two commits past what production runs (e200869).
Hosted **dev** runs the working tree (deployed with the Vercel CLI, dev project
only). Hosted **prod** runs e200869 and has NOT been pushed to.

Databases: local, dev and prod all carry migrations 059, 060 and 061 and record
them in `supabase_migrations.schema_migrations`. Prod's schema is therefore
ahead of prod's code; every one of the three is additive and the old code
ignores it (the new cron on prod calls a route that 404s until the push).

Gates on e34d002: typecheck 0, lint 9 pre-existing, vitest 116 files / 1541
tests, build green.

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

Still open from the HTTP review (weaknesses, ranked in the doc):

- `/api/img-proxy` and `/_next/image` (`remotePatterns: https://**`) are
  anonymous, unlimited image proxies.
- Anonymous cache-hit extracts mint a session, a request row, a quote lock and
  an audit row per cookie-less request with no rate limit.
- `/api/orders/:id/history` returns raw `audit_logs` rows (admin ids, pricing
  notes) to the customer.
- The proxy matcher skips image-extension paths; admin pages do not self-check.
- No CSP, HSTS or frame-ancestors headers. Rate limiter is per Vercel instance.
- Dependencies: 131 open alerts; request-reachable ones are `next` 16.2.9 (two
  critical, fixed in 16.3.3), `sharp`, `undici`, and `xlsx` (no npm fix). The
  db review doc has the upgrade commands. Not run.

## Decisions for Kelvin

1. **Push to prod.** One push deploys both projects. On prod the first run will
   verify the five stuck payments against Paystack, release the abandoned ones
   (emailing those customers "pay again"), and close the four pending orders
   older than 48 hours (emailing "we closed an unpaid order"). If the
   durations should differ, edit the two `site_settings` rows first; they are
   read on every run.
2. **Error tracking vendor.** Sentry or Datadog. Nothing was added.
3. **The open weaknesses above**, especially the `next` upgrade.
4. **First-run tour (handoff §3).** Not started; it needs the four decisions
   the handoff lists (what it points at, when it fires, the dismissed flag,
   signed-out visitors).
5. **Handoff §4** items are all still Kelvin's calls: fx pill fallback, PITR on
   prod, undeletable auth users, a nav entry for `/app/products`, the "—"
   table placeholder.
