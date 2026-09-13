# v2 release status — written 2026-09-13 while Kelvin was away

## 0. RESOLVED 2026-09-13 — the privilege escalation is closed on both hosted projects

**Applied to `tomame-prod` then `tomame-dev` via the Management API (runbook §2):**

```sql
BEGIN;
REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (first_name, last_name, bio) ON public.profiles TO authenticated;
COMMIT;
```

The grant list is **three columns, not the six in migration 051**, because hosted
is at 047 and `phone` / `whatsapp_opt_in` / `notify_email` do not exist there yet.
051 adds those columns and re-issues the same REVOKE + a six-column GRANT in the
same transaction, so applying it later is correct and idempotent — nothing here
needs changing for the deploy.

Verified afterwards on **both** projects by impersonating a real customer
(`set local role authenticated` + their `request.jwt.claims`, inside a
transaction that rolls back):

- `update profiles set role = 'admin' where id = <self>` → **blocked**, 42501
  permission denied for table profiles.
- `update profiles set first_name = …` → **still allowed**, so the deployed
  `PATCH /api/app/me` is unaffected.

Prod rows were not modified. (One dev row, `52632bab-…`, had its `first_name`
overwritten to `PrivCheck` by the first verification run before it was wrapped in
a rollback — the original value is not recoverable from `public`; set it to
whatever it should be.)

Also confirmed while checking: `anon` still holds a pointless table-wide INSERT
on `profiles`, but the `No direct profile inserts` policy is `WITH CHECK (false)`,
so it is not exploitable. Role changes all run through `createAdminClient()`
(`updateUser` / the promote path in `users.service.ts`, both called from
`/api/admin/users/*` with an admin client) — service_role keeps `ALL` and is
untouched by the REVOKE.

<details>
<summary>Original write-up (kept for the record)</summary>

### READ THIS FIRST — a live privilege escalation on production

**Any signed-in customer can make themselves an admin on prod right now.** Found
while building Phase 6; verified against the hosted databases with read-only
queries. Both dev and prod are affected.

The chain, all four links confirmed:

1. `authenticated` holds **table-wide UPDATE** on `public.profiles` (Supabase's
   default privileges; checked on both projects).
2. The RLS policy `Users can update own profile` is
   `USING (auth.uid() = id) WITH CHECK (auth.uid() = id)` — **no column
   restriction and no role guard**. RLS cannot restrict an UPDATE to a subset of
   columns; only a column-level GRANT can.
3. `custom_access_token_hook` copies `profiles.role` into `app_metadata.role`
   every time a token is issued or refreshed.
4. Every admin gate — `src/lib/supabase/proxy.ts` and all `/api/admin/*` routes —
   trusts `app_metadata.role`.

So a customer sends this straight at PostgREST, with the publishable key that
ships in their own browser:

```
PATCH /rest/v1/profiles?id=eq.<their own id>
  apikey: <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>
  Authorization: Bearer <their own session JWT>
  { "role": "admin" }
```

…refreshes their session, and is a full administrator.

**Why it has not been fixed here:** changing grants on a production database
unattended is exactly the class of action that needs you. The REVOKE also breaks
the deployed app if any column it writes is missing from the new grant, and I
could not smoke-test prod afterwards. Real-world exposure is currently small —
prod holds 2 profiles and 3 orders — which is the only reason this waited.

**The fix is already written**, as part of migration 051:

```sql
REVOKE UPDATE ON profiles FROM authenticated, anon;
GRANT UPDATE (first_name, last_name, bio, phone, whatsapp_opt_in, notify_email)
  ON profiles TO authenticated;
```

Those six are every column `PATCH /api/app/me` writes, so the deployed app keeps
working. Role changes already go through `createAdminClient` (service_role,
untouched). Verified locally as `authenticated` with a real customer JWT: the
six-column write succeeds, `set role='admin'` is refused.

Apply it to **prod first** — ahead of the rest of the migration run if you like,
it is independent — then dev.

---

Everything below is **local only**. Nothing has been pushed. No hosted database
has been touched. That is deliberate — see §3.

</details>

## 0b. 2026-09-13 (evening) — Kelvin's test findings fixed; hosted DEV migrated to 053 and deployed

**Fixed on `v2`** (commits `4902691`, `bcebb76`, plus `.vercelignore`): dead footer links
(`/blog`, `/careers`, `/how-it-works`); the Legal page's contact block now names the WhatsApp
line from `site_settings`; a Sign out button on the account rail (hard navigation to `/` —
`router.refresh()` after `replace("/")` raced the account page's own redirect and landed on
the login form); the assisted channel closes once used — an open `assisted_request` for a link
shows "A buyer is on it" and withdraws Describe it / Read it again / Add to bag on the paste
list, the bag and the Home receipt; the `?url=` path (Home paste bar, shared links) now
queues through `/api/pastes` and lands on the list as `?watch=<id>` with a visible reading
indicator, the 5 s / 20 s copy, auto-forward to the price, and a bell + email
(`paste_priced` / `paste_unreadable`) for signed-in customers whose paste crossed the 5 s
mark; "Read it again" on a lapsed quote was a silent no-op (`enqueueExtractionRequest`
returned any `ready` row untouched) and now re-queues. Verified in the browser against
local: reading row → "Taking longer than usual" at 6 s → "This one is being stubborn" at
20 s → describe-it → "A buyer is on it" with no actions; bell entry present; `?url=` →
`?watch=` → reading row; Sign out → logout 204.

**Hosted dev:** 048–053 applied in order via the Management API, each recorded in
`schema_migrations` (now 001–053 + hook). 048's guarded UPDATE moved
`site_settings.whatsapp_number` from the placeholder to `+233 59 442 4746` — that was
Kelvin's "WhatsApp number is not on the Legal page" on hosted. `supabase/seeds/policies.sql`
re-applied as an UPSERT (the seed's `DO NOTHING` cannot publish rows that already exist), so
all 5 policies are published with the repo's content. Dev profile `52632bab-…` still has
`first_name = 'PrivCheck'` from the morning's verification (see §0).

**Deployed to `tomame-dev`** from the working tree with the Vercel CLI — **not** a git push:
both Vercel projects build production from `main`, so pushing `v2` would only create
SSO-protected previews (on the prod project too). Public at https://tomame-dev.vercel.app
and https://dev.tomame.ca (the per-deployment URL 302s to Vercel SSO by design). Smoke
test: `/`, `/policies`, `/faq`, `/about`, `/contact`, `/app/orders/new`, `/app/bag`,
`/api/pastes` 200; `/app` 307 to login; real WhatsApp number on `/policies`; no dead footer
hrefs. `.vercelignore` is committed and root-anchored; the first attempt with a bare
`supabase` entry also excluded `src/lib/supabase` and failed with 94 module-not-found errors.
**A push to `main` will replace this deployment** — dev's production branch is `main`.

**Still for prod (Kelvin's go):** snapshot (no PITR), then 048–053, the policies upsert, and
a deploy. Prod's `site_settings.whatsapp_number` is still the placeholder until 048 lands.
`v2` is still not pushed to GitHub.

## 0c. 2026-09-13 (evening) — a second live hole, this one unauthenticated and on PROD

**`GET /api/admin/dashboard` had no authorization of any kind.** It answered any
anonymous caller with the business's order count, total revenue, active-user
count and a 30-day trend series, read through a **service-role** client.
Verified with a plain `curl` and no credentials against **both** hosted
projects; prod returned `{"totalOrders":4,...,"activeUsers":3}`.

Aggregates only — no names, addresses, emails or payment details are in that
payload — but it is the company's trading position served to the open internet.

The cause is an assumption about where the gate is, not one careless file:
`src/lib/supabase/proxy.ts` protects `adminRoutes = ["/admin"]`, and
`/api/admin/dashboard` does not start with `/admin` — it starts with `/api`.
Every other `/api/admin/*` route happens to carry its own
`getUserSession` + `canAccessAdmin` check, so **nothing else was exposed**.

**Fixed on `v2`** in both places: the route checks for itself like its
neighbours, and the proxy now gates the whole `/api/admin` prefix so the
namespace fails closed. API paths are refused with a JSON 401/403 rather than a
redirect — a 302 to `/auth/login` reaches `fetch()` as a 200 of HTML and
surfaces as a JSON parse error, which tells the caller nothing.

### A hotfix branch is ready for prod — NOT pushed, NOT deployed

`v2` is nowhere near shippable to production, so the fix is also on
**`hotfix/admin-api-gate`**, branched off `main`, two files, 51 insertions,
typecheck clean, carrying nothing from the redesign. It also removes a **second**
hole that is live on prod and was already fixed on `v2`: `main`'s proxy admits
anyone whose email ends in `@tomame.ca` to the entire admin **regardless of
role** — a domain backdoor around the column that decides admin access, on a
domain the company issues its own mailboxes on.

Deploying it is Kelvin's call (it is a production deploy). Verify after:

```
curl -s -o /dev/null -w '%{http_code}' https://<host>/api/admin/dashboard   # expect 401, was 200
```

### The wider sweep was clean

Every API route was checked for a missing auth call. The remaining
unauthenticated ones are legitimately public (auth, health, policies, the public
rate, catalogue search, media) and two that looked risky are not:
`/api/img-proxy` has a strict one-host allowlist, and `/api/payments/callback`
takes only a `reference` and re-verifies server-side rather than trusting a
status parameter.

## 1. What shipped on `v2`

| Slice | Commit | What |
|---|---|---|
| Phase 4 F3 | `543d1a4` | addresses, checkout, order groups, group payment, the pay rail |
| Phase 4 F4 | `51631e0` | the 390px bag, the Home freight-box card |
| — | `3c248a8` | the real WhatsApp number, read from `site_settings` everywhere |
| Phase 4 F5 | `462d686` | deleted what the bag replaced, collapsed the payment twins |
| — | `357371d` | a bag's order offers the bag, not a charge that can only fail |
| Phase 4.5 G1 | `5231387` | extraction becomes a background job (migration 049) |
| Phase 4.5 G2 | `a6509be` | a bag line can exist before its price |
| — | `19fee92` | review fixes: a crash, a vanishing card, a stuck job |
| Phase 4.5 G3 | `6b6acc3` | describe-it form, buyer queue (`/admin/assisted-requests`) |
| — | `752b0fc` | review fixes: a dropped correction, a loose public limit |
| Phase 4.5 G4 | `64b8f68` | Buy for me is a real screen; the receipt has a way out |
| Release | `854992f` | one status vocabulary; CLAUDE.md describes the real schema |
| Release | `fe576e9` | published the payment + shipping policies, corrected two facts |

Phase 5 (journeys + detail), Phase 6 (account) and the price-drop notifications
were built by background agents in separate worktrees; their outcome is recorded
in `docs/phase-4-handoff.md` §7 once merged.

## 1b. Phases 5, 6 and the price-drop job — merged

All three were built in isolated worktrees and merged into `v2`. The worktrees
are removed; `git worktree list` shows only the main checkout.

- **Phase 5 — journeys + detail** (migration 050). `order_events`,
  `orders.order_no` (`TM-00001…`, backfilled by `row_number()` rather than
  `nextval()` inside `UPDATE…FROM`, whose evaluation order Postgres does not
  promise), `eta_from`/`eta_to`. The 5-stop track is a presentation over the 7
  real statuses plus events — "US hub" lights only when a `hub_received` event
  exists, and `ORDER_STATUSES`/`ALLOWED_TRANSITIONS` are untouched. "Ask about
  this journey" is a WhatsApp deep link, per the same decision as the assisted
  requests; `message_threads` stays deferred. **Verified live**: the hub stop and
  its "New York · 0.6 lb · 6 Sep" line come from a real event row, and the
  `is_customer_visible = false` note beside it does not reach the API.
  - Found and fixed on the way: `PATCH /api/admin/orders/:id` was handing
    snake_case fields to a camelCase parameter and **silently discarding the
    carrier, tracking number and ETA on every call**.
  - Also removed as dead: `order-detail.tsx`, `my-orders.tsx`, `orders-list.tsx`,
    and the duplicate `POST /api/orders/new`.
- **Phase 6 — account** (migration 051). `profiles.phone`, `notify_email`,
  `whatsapp_opt_in`; the six-tab rail; addresses reuse `/api/addresses` and the
  bag's dialog (moved to `features/addresses/`, re-exported so nothing broke).
  Payment says plainly that no card details are stored, because none are.
  - Found and fixed: **`changePassword` never verified the current password.**
    The route collected `current_password`, checked it was non-empty and threw it
    away, so anyone with a live session could lock the owner out.
  - Also found: §0 above.
- **Price-drop notifications** (migration 052). A drop emails the customer; the
  watch job is now small batches every ten minutes instead of one 200-watch
  sweep. The rule that matters is re-notification — a price that merely stays
  low never alerts twice, and one that dips, recovers and dips back to the same
  level stays silent.

### What the agents could not verify

None of the three could open a browser — the dev server belongs to this
checkout. Their layout and animation claims are unconfirmed by `getComputedStyle`.
I have since smoke-tested every route and both new screens by hand (journeys,
journey detail, account, bag, Buy for me, and all four marketing pages); they
render and the data is real. The **animation delays on the Phase 5 and Phase 6
screens have still not been confirmed with `getComputedStyle`** — that is the one
gate left open, and it is worth a pass before release.

## 2. Gates

`npm run typecheck` clean · `npm run lint` **exactly 9** pre-existing errors ·
`npx vitest run` **76 files / 1004 tests** green · `npm run build` green.

Local migrations run to **053**. Hosted is at 047.

**Two gate gotchas:**
- While an agent worktree exists under `.claude/worktrees/`, an unfiltered
  `npx vitest run` globs it and reports roughly double. Use
  `npx vitest run --exclude '**/.claude/worktrees/**'`.
- `npm run build` reads `.env.local`, which points at **hosted dev**. It passes
  today only because every data route is dynamic, so page-data collection never
  executes a query against the missing tables. A green build does NOT mean the
  app works against hosted dev — it would fail at request time until §3 is done.

## 3. What is deliberately NOT done, and why

**No hosted migration has been applied.** Hosted dev and prod are still at 047.
Local is at 052. The runbook (`docs/DEPLOY-RUNBOOK-2026-09-12.md` §3) asks for a
verification pass after each migration, and there was nobody here to do it.
There is also a concrete hazard: **049 drops the `(user_id, url_hash)` unique
constraint on `extraction_requests`** and replaces it with a unique index over a
generated `owner_key`. The code currently deployed on hosted dev upserts with
`onConflict: "user_id,url_hash"`, so applying 049 ahead of a deploy makes that
upsert answer `42P10` and paste-recording degrades (it is caught and logged, not
fatal — but it is wrong). **Apply the migrations and deploy together.**

**Nothing pushed.** Standing instruction: `v2` is pushed only on Kelvin's
explicit go.

**No Terraform apply.** The dev Paystack public key is still `DUMMY-not-a-real-key`
in dev state; `.env.local` has the real `pk_test_`. Runbook §8 has the procedure.
Note `terraform apply` touching `module.resend` needs `resend_api_token`, which
is on no disk — Kelvin must supply it.

**`/faq`, `/contact`, `/policies` are still the pre-redesign screens.** They work
and now read the WhatsApp number from `site_settings`, but they have not been
rebuilt on the v2 design. That is the one item from the release list left
undone; it is a design job, not a correctness one.

## 4. Order of operations when Kelvin is back

1. Review and merge the three agent worktrees (`git worktree list`).
2. Run the gates and `/code-review` on the merged diff.
3. Apply 048 → 052 to **hosted dev** via the Management API, one at a time,
   inside `BEGIN/COMMIT`, recording each version (runbook §2, §3).
4. Re-apply `supabase/seeds/policies.sql` to hosted — the payment policy's
   network names and its exchange-rate sentence were both wrong and are fixed
   in the seed, and both rows are now published.
5. Smoke-test hosted dev, then push `v2`.
6. Prod: snapshot first (**prod has no PITR and no platform backups**), then the
   same migration sequence, on Kelvin's explicit go.

## 5. Things found on the way that are worth knowing

- **A failed re-extraction used to wipe a good cached price.** `upsertExtractionCache`
  overwrote unconditionally on `url_hash`, so a re-read of a link whose store was
  blocked that minute replaced a complete product with an empty one — and both
  `cart_items` and `orders` price from that row, so a bag line silently lost its
  price. Fixed: a complete result always wins; an incomplete one is refused while
  a complete, unexpired row stands.
- **Admin routes do not work on local dev.** The `custom_access_token` hook is
  commented out in `supabase/config.toml` and no local user has
  `app_metadata.role`, so `/admin/*` silently redirects to `/app`. Worked around
  by setting `app_metadata.role = 'admin'` directly on `builder-test@tomame.local`
  (password `Builder-test-2026!`, local only). Either enable the hook locally or
  document this, or the next person loses an hour to it.
- **The extraction vendors are struggling.** ScraperAPI is healthy (4,825 credits)
  but Zyte answered `520 Website Ban` for MicroCenter and Browserless timed out at
  408. The slow-extraction UX in Phase 4.5 papers over this; the underlying vendor
  health is worth its own look.
- **Paystack is unblocked and the pay path is proven as far as it can be.** With
  the real `sk_test_` in `.env.local`, `POST /api/payments/initialize
  {orderGroupId}` returned a live checkout URL for a three-order group
  (`https://checkout.paystack.com/…`, GH₵24,984.65 as `2498465` pesewas). The
  webhook accepted a correctly-signed payload, re-verified it against Paystack,
  and — because no real payment had been made — marked the payment `failed` and
  left all three orders `pending`. **That is the right answer**: the handler does
  not trust its own payload. Defence in depth, working.
  - The final leg, a genuine `charge.success` fanning `paid` out to all three
    orders, is covered by unit test (`group-payment.test.ts`: "links every order
    once, flips the group once, sends one email"). It was not exercised live
    because completing the checkout means entering card details, which I do not do.
  - **Paystack rejects a `.local` email address.** `kwame@tomame.local` cannot
    pay. I proved the flow by temporarily moving that account to
    `kwame.test@example.com` and then **restored it**, so the documented login is
    unchanged. To exercise payment yourself, give the test customer a real-looking
    address first.
