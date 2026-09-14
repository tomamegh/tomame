# Next session — production deploy, fixes, and parcel photos

Branch `v2` at `37508ee`. Hosted **dev** is deployed and current; **production is
not** — it still runs `main`, which is 6 commits behind and carries two live
security holes.

Read `docs/RELEASE-STATUS-2026-09-13.md` §0–§0e first: it is the record of what
shipped, what is deliberately unfinished, and every bug found along the way.
`CLAUDE.md` has the standing rules. `docs/DEPLOY-RUNBOOK-2026-09-12.md` §1–§3 has
the migration procedure and the one command that would break production.

---

## 1. FIRST: the production deploy

### 1a. What production is right now

| | dev | prod |
|---|---|---|
| Vercel project | `tomame-dev` | `tomame-prod` |
| Code | `v2` @ `37508ee` (deployed by CLI) | `main` @ `58d7f7a` |
| DB migrations | **053** | **047** + the access-token hook |
| Live rows | 3 profiles | **4 orders, 3 payments, 4 profiles** |
| Paystack keys | `sk_test_` / `pk_test_` | **LIVE `sk_live_` / `pk_live_`** |
| PITR | — | **disabled, zero platform backups** |

Two security holes are live on prod right now, both fixed on `v2` and both
carried back to **`hotfix/admin-api-gate`** (branched off `main`, 2 files,
51 insertions, typecheck clean, nothing from the redesign):

1. `GET /api/admin/dashboard` has **no authorization at all** — an anonymous
   `curl` returns the order count, revenue, active users and a 30-day series out
   of a service-role client. Verified live against prod.
2. The proxy admits anyone whose email ends in `@tomame.ca` to the whole admin
   **regardless of role** — a domain backdoor on a domain the company issues
   its own mailboxes on.

**If the full deploy below is going to slip by more than a few hours, ship
`hotfix/admin-api-gate` to prod on its own first.** It is a two-file change and
independent of everything else.

### 1b. The hazard that decides the order of operations

**Both Vercel projects build production from `main`.** Pushing `v2` creates only
SSO-protected previews; merging `v2` → `main` and pushing deploys **prod *and*
dev simultaneously** and replaces the CLI-built dev deployment.

That means **the prod database must be migrated before the merge lands**, and
`main` must not reach prod while prod is at 047. Specifically: migration 049
drops the `(user_id, url_hash)` unique constraint on `extraction_requests`, and
the code on `main` upserts against it — so the two must move together.

### 1c. Order of operations

1. **Back prod up.** PITR is off and the platform lists zero backups. Take a
   logical snapshot of all public tables + auth users before touching anything
   (the 2026-09-12 session did this into the scratchpad; do it somewhere durable
   this time). Consider enabling PITR while you are there.
2. **Apply 048 → 053 to prod**, one at a time, each wrapped in `BEGIN/COMMIT`,
   through the Supabase Management API exactly as runbook §2 describes — **never
   `supabase db push`**, and build the JSON with a real encoder. Record each
   version in `supabase_migrations.schema_migrations` after it succeeds. Dev took
   these cleanly; the scratchpad helper from that session is the pattern.
3. **Re-apply `supabase/seeds/policies.sql` as an UPSERT.** The seed's
   `ON CONFLICT DO NOTHING` cannot publish rows that already exist, and prod's
   `payment` and `shipping` policies are unpublished — the quote screen links to
   `/policies#payment`, so those are live links to nothing today.
4. **Verify prod's schema** against runbook §3c, then check
   `site_settings.whatsapp_number` moved off the placeholder (048 carries that
   UPDATE) and that all five policies are published.
5. **Merge `v2` → `main` and push.** Both projects deploy. Watch the prod build.
6. **Smoke-test prod**, signed out and signed in:
   - `curl -s -o /dev/null -w '%{http_code}' https://<prod>/api/admin/dashboard`
     → **401** (was 200).
   - Marketing routes 200, `/admin` 307 to login, `/app` 307 to login.
   - An admin can sign in and reach `/admin`.
   - **Do not complete a Paystack checkout on prod** — those are live keys and a
     real charge. Verify the initialize call returns a checkout URL and stop.
7. `hotfix/admin-api-gate` can then be deleted — `main` will contain the fix.

### 1d. Also worth doing during the deploy

- Prod's `site_settings.payment_channels` should be the 048 object shape; the
  bag's pay selector depends on it.
- Dev profile `52632bab-…` still has `first_name = 'PrivCheck'` from a
  verification run. Cosmetic, dev only, set it to whatever it should be.

---

## 2. Errors and debt to fix

Ordered by how much they matter. The first three are correctness; the rest is
hygiene.

1. **`policies` API routes write the table from the route handler with no audit.**
   `src/app/api/admin/policies/route.ts` and `.../[slug]/route.ts` call
   `createAdminClient()` and insert/update/delete `policies` inline — a layering
   violation (CLAUDE.md: `app/api/**` is HTTP only) and, worse, **no
   `logAuditEvent`** on changes to public legal text. "Who unpublished the returns
   policy, and when" is currently unanswerable. Move the data access to
   `db/queries/`, the logic to a service, and audit it — `AUDIT_ENTITY_TYPES.POLICY`
   now exists.
2. **`listAllNotifications` is dead *and* broken.**
   `src/features/notifications/services/notifications.service.ts:42` selects
   `profiles.email`, which is not a column (the address lives in `auth.users`).
   PostgREST answers 42703, the service swallows it and returns `[]` — which is
   why the admin notification log rendered empty in every environment from the day
   it shipped. `db/queries/admin-notifications.ts` replaced it and nothing calls
   the old one. Delete it before someone does.
3. **`orders/[id]/review` authorizes with an inline role check** rather than
   `canAccessAdmin`, which `lib/auth/admin-access.ts` documents as the single
   rule. Behaviour is identical today; the last time two spellings existed they
   diverged into the `@tomame.ca` backdoor above.
4. **`pricing.service.ts` invents defaults** (`map.freight_rate_per_lb ?? 5`,
   `?? 0.04`, …) against the "never invent a constant" rule. The pricing console
   now surfaces the gap, but nobody has decided which surface wins: fail the
   quote loudly, or keep the fallback and make it visible. **Kelvin's call.**
5. **Dead code** left by the admin rebuild, all flagged by the agents that
   orphaned it: `src/features/transactions/**` except its service
   (`admin-transactions-table/`, `transaction-stat-cards`, the two badges,
   `hooks/useTransactions`), `src/features/pricing/hooks/usePricingGroups.ts`,
   the two `*TableMeta` types in `features/pricing/types`, and
   `useAdminNotifications` / `useAdminUsers` / `useAdminUserDetail` /
   `useUpdateUser` (the last is also mistyped — it posts `{email}` to a route
   that wants `{role}`). Check importers with the compiler, not by eye.
6. **`admin-filter-pills.tsx`** lives under `features/orders/components` but is
   imported by the deliveries screen too; it is kit-shaped and probably belongs
   in `components/layout/admin`. Same question for
   `features/settings/components/admin-controls.tsx` (`AdminButton`,
   `AdminInput`, `AdminConfirm`), which several admin screens import.
7. **`admin-transitions.ts` mirrors `ALLOWED_TRANSITIONS`**, which is
   module-private in `orders.service.ts`. The mirror is accurate today (verified);
   exporting the service's table and importing it would remove the duplication.
8. **`/faq`, `/contact` and `/policies` are still the pre-redesign layouts.**
   They work and their bugs are fixed, but they have not been rebuilt on v2.
9. **An auth user cannot be deleted once they have an `audit_logs` row** —
   `audit_logs.actor_id` references `profiles(id)` with no `ON DELETE`, and the
   table is append-only, so `auth.admin.deleteUser` fails with an empty error.
   Signing in writes such a row, so any account that has ever logged in is
   undeletable. Nothing offers user deletion today; make it a deliberate decision.
10. **A stray local-only admin account**, `admin-slice-check@tomame.local`, exists
    on the LOCAL database, neutralised (random password, no role claim, banned
    until 2126). It survives because of (9). Remove it if you clean up audit rows.

### Known non-issue

`npm run build` on this machine can fail with `Failed to fetch 'Bricolage
Grotesque' from Google Fonts` / `Can't resolve @vercel/turbopack-next/...font`.
That is the network, not the code — the same commit builds on Vercel. If the
local build fails, check that message before believing you broke something.

---

## 3. The journey detail screen on a phone

**Kelvin: "On mobile, the journey for one product is very bad."** His screenshot
shows the product title and the stage track running off the right edge of the
card.

**Diagnosed and verified in the browser at 390px** — do not re-derive it:

- `src/features/journeys/components/journey-detail-view.tsx:80` — the outer grid
  is `grid items-start gap-6 lg:grid-cols-[1fr_380px]`. Below `lg` that is an
  implicit column, i.e. `minmax(auto,1fr)`, whose floor is its content's
  min-content width.
- Its content's min-content is set by the track scroller at line 108–109: an
  `overflow-x-auto` wrapper around `min-w-[560px]`. **An overflow container still
  reports its content's min-content width unless it is given `min-width: 0`**, so
  the 560px propagates all the way up.
- The `<h1>` also carries `max-w-[560px]` with `overflow-wrap: normal`.

Measured: the card renders **606px wide inside a 350px grid column**. It is not
visible as a sideways page scroll only because `<main>` has `overflow-x-clip` —
which *hides* this class of bug rather than fixing it.

Applying all three of these in the browser brought the card to 350px and made the
track scroll correctly inside itself (verified):

```
outer grid   → grid-cols-[minmax(0,1fr)] lg:grid-cols-[1fr_380px]
track scroller → add min-w-0
h1           → max-w-full lg:max-w-[560px], plus break-words
```

While you are in there, the rest of that screen deserves a phone pass: the
`What you paid` rows, the `Deliver to` block and the updates feed were all
authored against the desktop artboard.

**This bug class has now appeared five times** (account, marketing hero,
Journeys list, journey detail). `~/.claude` memory `project-mobile-css-gotchas`
records it. Sweep every remaining route at 390px and assert
`document.documentElement.scrollWidth === 390` **and** that no card's
`getBoundingClientRect().right` exceeds the viewport — the second check is the
one that catches what `overflow-x-clip` hides.

---

## 4. New feature: the warehouse photo, and what the customer says back

**Kelvin's brief, verbatim:** *"When an item reaches a warehouse, Tomame admin
takes a pic and uploads, and as a shopper I see the pic and it updates on the
journey page. So in case the item purchased does not match what the customer
wants, the customer can share feedback that goes to the admin."*

This is the first point in the product where the customer sees **what was
actually bought** rather than what they asked for, so it is also the first point
where they can catch a mistake while it is still cheap to fix. Treat the
feedback half as the important half.

### What already exists to build on

- **`order_events`** (migration 050) is the journey's timeline: `kind` includes
  `hub_received`, plus `title`, `detail`, `location`, `weight_lbs`,
  `occurred_at`, `is_customer_visible`, `created_by`. RLS gives the owner
  read-only access to visible rows and admins read-all; **every write is
  service-role by design** — a customer must never write their own parcel's
  history. The journey screen already renders these
  (`journey-updates-card.tsx`).
- **An image pipeline with real validation**:
  `src/features/media/services/media.service.ts` re-encodes every upload through
  `sharp` (never storing what was sent), enforces a byte cap and pixel cap,
  bakes in EXIF rotation, and writes to **Supabase Storage** via
  `createAdminClient().storage.from("marketing-media")`. Reuse the validation
  approach; it is currently hardcoded to `MarketingImageKey`, so it needs
  generalising or a sibling.
- **Two worked examples of "customer says something → admin works a queue"**:
  `assisted_requests` (049) and `contact_messages` (053). Both have an admin
  screen, a guarded `from → to` status transition so two staff cannot claim one
  item, and a badge fed by `getAdminQueueCounts` in
  `src/db/queries/admin-queues.ts`.
- **`/admin/orders/[id]`** already has the ops panel, the state machine controls
  and the `order_events` history — the natural home for the upload.

### Constraints that are not negotiable

- **These photos are private.** `marketing-media` is a public bucket; a photo of
  a customer's parcel is not marketing. Use a **separate private bucket** and
  serve it through short-lived **signed URLs** generated server-side, or storage
  RLS. A public URL for a parcel photo is a data leak.
- **The upload must not sit behind `isBuilderEnabled()`.** The existing
  `/api/admin/builder/[key]` route is gated by a deployment flag that is off in
  production; this is a production operations feature.
- Every admin write here is a state change on someone's order → `logAuditEvent`,
  per CLAUDE.md. `AUDIT_ENTITY_TYPES` gained `CONSOLIDATION_BOX`, `CART`,
  `POLICY`, `SITE_SETTING`, `SITE_CONTENT`, `REGION` and `DELIVERY_ZONE` this
  session; add what you need.
- Migrations are at **053**; yours is **054**. `supabase/migrations/` is the
  authority — read 050 before you touch `order_events`.
- Nothing static: if there is no photo yet, the journey says so plainly. No
  placeholder parcel images.

### Decisions to make (flag them to Kelvin rather than guessing)

1. **Where the photo lives.** An attachment column on `order_events`, or its own
   `order_photos` table keyed to the order? A separate table is probably right —
   several photos per arrival, and they outlive any single event — but it means
   the timeline has to join.
2. **What the feedback is.** A new `order_feedback` table with its own admin
   queue is the shape that matches `assisted_requests` and `contact_messages`.
   Reusing `assisted_requests` would be wrong: that is a *pre-purchase* "we could
   not read this page" escape hatch, and this is post-purchase.
3. **Does an objection stop the parcel?** If a customer says "this is the wrong
   colour" while the box is at the hub, does the order pause, or does it fly and
   get resolved after? This is a business decision with real money in it and it
   changes the state machine. **Ask.**
4. **Who is told, and how.** The notification vocabulary now has `order_placed`,
   `price_drop`, `paste_priced`, `paste_unreadable`; a photo arriving is a
   natural fifth (`lib/email/templates/`, `mayEmailUser` honours the account's
   Email toggle). Whether the customer gets an email or just the bell is Kelvin's
   call.

### Scope check

This is a migration, an upload path, a private storage bucket, an admin screen,
a customer screen, a feedback queue and a notification. **It is not one session's
work alongside a production deploy.** Do the deploy and the fixes first, then
build this behind whatever the answers to (1)–(4) turn out to be. If it has to be
split, ship the photo (admin uploads → customer sees) before the feedback loop;
the photo alone is useful and the feedback is meaningless without it.

---

## 5. Gates and working rules

- `npm run typecheck` → 0 errors.
- `npm run lint` → **exactly 9** pre-existing errors, none in code you touched.
- `npx vitest run` → **97 files / 1275 tests** green.
- `npm run build` → green (see the Google Fonts note above).
- Verify in the browser at **390px** as well as desktop; the local admin login is
  `builder-test@tomame.local` / `Builder-test-2026!` and the customer is
  `kwame@tomame.local` / `Kwame-test-2026!`. The login form is react-hook-form
  with `Controller`, so typed keystrokes do not reach its state — drive it with
  the native value setter (the `~/.claude` memory
  `project-local-test-login` has the snippet).
- The local dev server reads `.env.development.local` (**local** Supabase);
  scripts run with `--env-file=.env.local` hit **hosted dev**. Do not mix them up.
- Tailwind v4 scans every non-gitignored file for class candidates, Markdown
  included — `globals.css` now excludes `docs/`, `design/` and `specs/`. Never
  write a bracketed class name in prose inside `src/`.
- A class-name constant shared with a server component must live in a module with
  no `"use client"`; a client module's export reaches a server component as a
  client-reference object and `cn()` drops it silently.
