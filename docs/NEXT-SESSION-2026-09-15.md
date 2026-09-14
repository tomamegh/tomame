# Next session: money that never settles, security, observability, and a first run

Branch `main` at `d094a7b`. **Dev and production are identical** — same commit, both
databases at migration **058**, verified on 10 schema checks. Everything from
2026-09-14 is live: parcel photos, the feedback queue and parcel hold, the em
dash sweep, the admin login fix, pre-scraping in both directions, and the
reworked Buy for me.

Gates as they stand: `npm run typecheck` 0 · `npm run lint` **exactly 9**
pre-existing errors · `npx vitest run --exclude '**/.claude/worktrees/**'`
**111 files / 1467 tests** · `npm run build` green.

CLAUDE.md has the standing rules. `docs/DEPLOY-RUNBOOK-2026-09-12.md` §1–§3 has
the migration procedure. `docs/RELEASE-STATUS-2026-09-13.md` is the record of the
release before this one.

---

## 0. START HERE: nobody has ever successfully paid

This is the most important thing in this document and it is not a feature
request. Read it before planning anything else.

**On production, every payment ever created is still `pending`.** Not one has
reached `success` or `failed`, over five days and five attempts:

| | prod |
|---|---|
| `payments` rows | 5, **all `pending`** (9 Sep → 14 Sep) |
| `payments` `success` | **0** |
| `payments` `failed` | **0** |
| `orders` | 6: 4 `pending`, 2 `cancelled` |
| `audit_logs` `payment_initialized` | 5 |
| `audit_logs` payment verified / succeeded / failed | **0** |

Five real people reached Paystack checkout on a live account and the application
does not know what happened to any of them. Zero *failures* is the tell: if
customers were simply abandoning, a webhook would have marked at least some of
them failed. Zero of both means **nothing is coming back from Paystack at all.**

**What has been ruled out.** The endpoint is deployed and healthy:
`POST https://tomame.ca/api/payments/webhook/paystack` with an unsigned body
answers **400**, which is the correct refusal, not a 404. The route, the HMAC
check and the verify path all exist in code. So this is not a missing handler.

**The most likely cause, unverified:** the webhook URL is not configured on the
LIVE Paystack dashboard, or points somewhere else. That is a Kelvin action, not a
code change: set it to `https://tomame.ca/api/payments/webhook/paystack` and
confirm Paystack's delivery log shows attempts. Check the test account too, since
dev is in the same state.

Also confirm `PAYSTACK_SECRET_KEY` on `tomame-prod` is the **live** key and
matches the account the webhook is configured on: the signature is HMAC-SHA512
with that secret, so a mismatched key produces exactly this symptom — deliveries
arriving and every one rejected. If Paystack's log shows attempts and the app
shows none, that is where to look. Note `/api/payments/callback` is not a
substitute: it only runs if the customer returns to the browser tab.

**Do not test this by completing a payment on production.** Those are live keys
and a real charge. Verify on dev with test keys — but see §5, dev's test secret
was invalid as of 2026-09-13 and may still need a real `sk_test_`.

### 0b. Kelvin: "paystack orders need to be expired after sometime"

Directly related, and the second half of the same problem. A `pending` payment
today waits forever: there are rows five days old that will sit there until
somebody notices. That is bad in three separate ways.

- The customer's bag and order are held hostage to an intent they abandoned.
- A `quote_lock` is consumed and the 24-hour price is frozen against a payment
  that will never land.
- The admin's own dashboard counts them, so "what is waiting for a person" is
  wrong.

Build an expiry. The shape that matches this codebase is pg_cron → pg_net → a
Vercel route with `Bearer CRON_SECRET` (CLAUDE.md, "Background Jobs"), small
idempotent batches, following `run_catalog_scrape()` in migration 045 — read the
vault first and the GUC second.

Decisions to put to Kelvin rather than guess:
- **How long.** A Paystack checkout session has its own lifetime; an order held
  for a Mobile Money customer who is finding their phone is not the same as one
  abandoned overnight. 30 minutes and 24 hours are both defensible and they are
  different products.
- **What expiry DOES.** `pending_payment → cancelled` is already legal in the
  state machine ("only if payment fails") and is the obvious move, but it must be
  reversible if a late webhook arrives: a customer who paid at minute 31 must not
  find their order cancelled. **Verify before cancelling** — call Paystack's
  verify endpoint for the reference, and only cancel what Paystack also says is
  abandoned. That single rule is what makes this safe.
- **Whether the customer is told.** An order that quietly vanishes is worse than
  one that says why. The notification vocabulary already has `order_placed`,
  `price_drop`, `paste_priced`, `paste_unreadable`, `parcel_photo_added`.

---

## 1. Security review

The whole application, adversarially, not a skim. Three live holes were found and
closed in the last two sessions and every one of them was a gap between two
places that were each individually reasonable, so look at seams rather than
files.

**What has already been fixed — do not re-litigate, but DO check for
recurrences of the same shape:**

- `GET /api/admin/dashboard` answered anonymous callers with revenue and user
  counts. Cause: the proxy gated `/admin` and the route started with `/api`. Now
  the whole `/api/admin` prefix fails closed.
- The proxy admitted anyone with an `@tomame.ca` email regardless of role.
- Any signed-in customer could `PATCH` their own `profiles.role` to `admin`
  through PostgREST. Closed with a column-level GRANT; RLS alone cannot do it.
- **Five different spellings of "is this an admin"** were found and collapsed
  into `canAccessAdmin` (JWT claim). Two more appeared the same day in new code.
  `grep -rn "role.*=== *\"admin\"\|profile\.role\|app_metadata" src/` and treat
  every hit that is not `lib/auth/admin-access.ts` as suspect.

**Specific things to go at:**

1. **Every `/api` route, again, as a table**: path → who may call it → what
   proves it. The last sweep was by eye; make it exhaustive and write it down.
   Pay attention to routes added on 2026-09-14: the parcel photo upload and
   serving routes, the order feedback routes, the hold routes, the catalogue
   search.
2. **RLS per table, tested as a customer.** Impersonate with
   `set local role authenticated` + `request.jwt.claims` inside a transaction
   that rolls back (the 2026-09-13 session's technique). Assert a customer cannot
   read another customer's orders, photos, feedback, addresses, carts or
   notifications. Every table has RLS ON — that is not the same as the policies
   being right.
3. **The service-role client.** `grep -rn "createAdminClient" src/` and justify
   each one: it bypasses RLS entirely, so every call is a place where the
   ownership check has to be in the TypeScript. `/api/order-photos/[photoId]`
   is the pattern to copy — it re-checks per request and answers a uniform 404.
4. **Money.** Nothing client-supplied may reach a total. Order creation prices
   from the server-side `extraction_cache` snapshot; confirm nothing has drifted.
   Check `quote_locks` cannot be replayed or minted for someone else's quote.
5. **The public surface.** `/app/orders/new`, `/app/orders/review`, `/app/bag`
   and now `/app/products` are deliberately public. Confirm each leaks nothing
   about another viewer, including through `tm_quote_session`.
6. **Storage.** `parcel-photos` is private and served through an authenticated
   route. Confirm no signed URL or public URL for it exists anywhere, and that
   the `marketing-media` bucket has not been made public by accident.
7. **131 Dependabot vulnerabilities** on the default branch (2 critical, 58
   high) as of the 2026-09-14 push. Nobody has triaged them. At minimum
   establish which are reachable from a request path.

---

## 2. Observability

Kelvin: "How we can monitor payments, scraping crons, attempts and anything
affecting user experience."

**What exists today.** `src/lib/logger` is `console.log(JSON.stringify(...))`.
That is it. In production those lines land in Vercel's function logs, which are
searchable for a short retention and alert on nothing. `@vercel/analytics` and
`@vercel/speed-insights` are installed and are page-level only. `audit_logs` is
the one durable record of what happened, and it is genuinely good — it is how §0
above was diagnosed. There is **no error tracking, no alerting, and no
dashboard**: the fact that five payments had been stuck for five days was
discovered by hand, by querying the database, in the course of writing this
document. That is the gap.

**Design the answer before building it.** The question is not "which tool" but
"what must never again go unnoticed for five days". Start from the failures this
codebase has actually had, all of which were silent:

- Payments initialise and never resolve (§0, live now).
- The admin notification log rendered empty in every environment from the day it
  shipped, because a query selected a column that does not exist and the error
  was swallowed.
- `order_deliveries` upserts failed silently for as long as that table existed,
  because `ON CONFLICT` had no unique index to match.
- A notification failure requeued a finished extraction and charged a vendor
  twice.
- A paste-derived catalogue term would have outranked every curated one, and the
  curated list would simply have stopped being scraped.

Every one of those was a thing working "fine" while doing nothing. Detection has
to be about **absence**, not just errors: a cron that stops running, a queue that
stops draining, a payment that never resolves, a notification that stays
`pending`. Nothing currently watches for absence.

**Concretely worth building:**

1. **An operational dashboard in the admin.** Payments by status with age
   (a `pending` older than the expiry in §0b is an alarm); `notifications`
   `pending`/`failed`; `extraction_requests` failed in the last 24h; each cron's
   last successful run and its `job_budgets` consumption; `catalog_products`
   growth. All of it is already in the database and none of it is surfaced.
   `src/db/queries/admin-queues.ts` is the pattern.
2. **Cron heartbeats.** Five jobs run via pg_cron → pg_net (`fetch-exchange-rates`,
   `cleanup-extraction-cache`, `cleanup-quote-locks`, `recheck-price-watches`,
   `catalog-scrape`, `sweep-extractions`). If pg_net stops reaching the app
   nothing notices. Record last-run and last-success per job and alert on
   staleness. Note `run_catalog_scrape()` already `raise warning`s when `app_url`
   is unset — that pattern deserves to be a visible signal, not a database log
   line nobody reads.
3. **Error tracking with alerting.** Sentry is the obvious fit for Next.js and
   would have caught several of the above. Get Kelvin's call on the vendor before
   adding a dependency; a Datadog MCP is connected to this workspace, which may
   mean Datadog is the house choice.
4. **Keep `audit_logs` the source of truth for what happened.** It is append-only
   and already carries the actor. Do not build a second, weaker history.
5. **A synthetic check.** One scheduled request that pastes a known URL and
   asserts a price comes back would have caught more customer-facing breakage
   than any log line.

Privacy: CLAUDE.md says never log secrets or PII. Metrics and ids, not names,
addresses or product URLs tied to a person.

---

## 3. First-run greeting and a guided tour

Kelvin: "once a user logs in for the first time, I want a first time greeting
message and small tour pointing and animation to walk them through."

**Nothing exists.** `grep` for onboarding, tour, walkthrough, first_run returns
nothing, and `profiles` has no column to record that someone has seen it.
`motion` (v12) is already a dependency and is used elsewhere, so the animation
has a home.

**What has to be decided (ask, do not guess):**

- **What the tour actually points at.** The app has two front doors now: paste a
  link, or browse what we have already priced. It should probably walk: here is
  where you say what you want → here is the landed price, all of it, in cedis →
  here is your bag → here is the journey. Four stops is a tour; eight is an
  obstacle.
- **When it fires.** "First login" is ambiguous: a customer can use the whole
  quote flow signed out (that is deliberate) and only sign in at checkout, so
  their first login may be their most impatient moment. First *visit to `/app`*
  may be the better trigger.
- **Skippable, and never twice.** It needs a dismissed/completed flag. A
  `profiles` column is the natural home and means it survives a device change;
  `localStorage` alone will re-show it on every new browser. Migration 059.
- **Signed-out visitors.** They can reach most of the product. Do they get it?

**Non-negotiables:** it must be dismissible at every step, must not trap focus
or block the tab bar, must be correct at 390px (see the house rules below), and
must not fire on top of a customer mid-checkout. Respect
`prefers-reduced-motion`: an animated pointer is exactly what that setting is
for.

---

## 4. Refactor and polish, and what is left

Carried forward, still true:

1. **`/faq`, `/contact` and `/policies` are still the pre-redesign layouts.**
   They work and their bugs are fixed, but they were never rebuilt on v2.
2. **`pricing.service.ts` fallbacks are gone** (fail loudly, Kelvin's call), but
   `fx-rate.service.ts:81,87` still does `constants.fx_buffer_pct ??
   DEFAULT_FX_BUFFER_PCT`. It feeds the nav rate pill, not a quote, so on a read
   failure the pill shows a confident rate while every quote returns
   `needs_review`. Kelvin to decide whether the pill goes quiet.
3. **An auth user cannot be deleted once they have an `audit_logs` row.**
   `audit_logs.actor_id` references `profiles(id)` with no `ON DELETE`, and the
   table is append-only, so any account that has ever signed in is undeletable.
   Nothing offers deletion today; this is a GDPR-shaped decision, not a bug.
4. **`admin-slice-check@tomame.local`** exists on the LOCAL database only,
   neutralised and banned until 2126. It survives because of (3).
5. **`/app/products` has no nav entry.** Reachable from Buy for me's browse mode
   and from the quote rail. A fifth tab would crowd the 390px bar. Kelvin's call.
6. **PITR is off on production and there are zero platform backups.** The logical
   snapshot at `~/tomame-backups/prod-2026-09-14/` is a record, not a restore
   path: no `auth.sessions`, no storage objects. Raise enabling PITR.
7. **The standalone `"—"` empty-cell placeholder** survives in admin tables and
   the fees table. It is a table convention for "no value", not prose, which is
   why the em dash sweep left it. Change it if Kelvin was including those.

Polish worth doing while in there: the admin screens have never had a 390px pass
(they were built desktop-first and an operator with a phone is a real user), and
`src/features/transactions/` is now a service with no components, which may mean
it should fold into `features/payments`.

---

## 5. Gates and working rules

- `npm run typecheck` → 0 errors.
- `npm run lint` → **exactly 9** pre-existing errors, none in code you touch.
- `npx vitest run --exclude '**/.claude/worktrees/**'` → 111 files / 1467 tests.
  **Read the `Test Files` line, not just `Tests`.** A file that fails to LOAD
  still reports its own tests as passing; that trap hid a broken test file for
  two commits on 2026-09-14.
- `npm run build` → green. A local failure quoting Google Fonts
  (`Bricolage Grotesque`) is the network, not the code.
- Verify in the browser at 390px AND desktop. Assert
  `document.documentElement.scrollWidth === 390` and that no element outside a
  horizontal scroll container has `getBoundingClientRect().right` past the
  viewport — the second check is the one that catches what `overflow-x-clip`
  hides.
- Local logins: admin `builder-test@tomame.local` / `Builder-test-2026!`,
  customer `kwame@tomame.local` / `Kwame-test-2026!`. The login form is
  react-hook-form with `Controller`, so typed keystrokes do not reach its state:
  drive it with the native value setter.
- **The admin role lives in the JWT claim, not on `session.user`.** The hook
  never writes `raw_app_meta_data`, so `session.user.app_metadata.role` is
  undefined for every hosted account including real admins. Local masks this
  because the hook is commented out there and the local admin has the role set
  directly. Use `canAccessAdmin` on decoded claims.
- The local dev server reads `.env.development.local` (local Supabase); scripts
  run with `--env-file=.env.local` hit hosted dev. Do not mix them up.
- Tailwind v4 scans every non-gitignored file for class candidates, Markdown
  included. Never write a bracketed class name in prose inside `src/`.
  A custom property must be registered in `@theme`, not only declared on
  `:root`, or its utility compiles to nothing — that is why the admin filter
  pills had no active background for weeks.
- `cn()` silently drops an arbitrary padding class containing a `calc()`. Named
  utilities exist: `tm-clear-tab-bar`, `tm-above-tab-bar`.
- No em dashes in customer-facing copy; 227 were removed on 2026-09-14.
- One push to `main` deploys BOTH Vercel projects. **Migrate the databases
  first.** To deploy dev alone, use the Vercel CLI with the dev project id.
- Applying a migration to production through the Management API sometimes gets
  refused by the permission classifier. It is transient: retry before concluding
  you are blocked.

---

## 6. Suggested order

§0 first and on its own — it is live, it is money, and most of it is a Paystack
dashboard setting plus a decision about expiry. Then the security review, because
it may change what gets built. Then observability, since it is what tells you
whether any of the rest is working. The first-run tour last: it is the most
visible and the least urgent, and it will be better designed once you have
watched what people actually do through the dashboard built in §2.
