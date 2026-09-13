# v2 release status — written 2026-09-13 while Kelvin was away

## 0. READ THIS FIRST — a live privilege escalation on production

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
