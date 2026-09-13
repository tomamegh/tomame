# v2 release status — written 2026-09-13 while Kelvin was away

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

## 2. Gates

`npm run typecheck` clean · `npm run lint` **exactly 9** pre-existing errors ·
`npx vitest run` green · `npm run build` green.

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
