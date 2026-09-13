# Prompt for the session that finishes v2 (written 2026-09-13, after Phase 4 F3)

Paste everything between the fences into a fresh Claude Code session opened at the repo root.

```
Finish the Tomame v2 redesign on branch `v2`. Nothing is pushed to GitHub and nothing must be pushed
until v2 is complete — hosted dev/prod deploy from the remote. Phase 4 F3 is built and verified but
UNCOMMITTED in the working tree; commit it first as "Phase 4 F3: addresses, checkout, group payment,
the pay rail" (do not reset the tree).

Read, in this order, before touching anything:
1. docs/phase-4-handoff.md — §1 approved decisions (do not reopen), §7 what F1/F2/F3 built, the
   three traps (QueryClient leak, stale .next, stale RSC modules), the F3 note (blocked Paystack
   secret, local test login, deferred review cleanups), §8 for context.
2. docs/HANDOFF-2026-09-12.md §4 (approved decisions) and §8 (backend asks A/B, standing debt);
   docs/phase-3-handoff.md §9 (total_usd, quote_assurance, AppBottomTabs opt-in, QuoteGapFillers).
3. docs/DEPLOY-RUNBOOK-2026-09-12.md §2/§3/§8 — hosted DBs are at 047; 048 is local only. Never
   `supabase db push`; apply via the Management API in BEGIN/COMMIT and record the version. Vercel env
   only through Terraform (§4/§8). Prod has no PITR — get Kelvin's go and a snapshot before prod.
4. docs/redesign-data-map.md Phase 4 (~line 422), Phase 5 (~565), Phase 6 (~680).
5. docs/phase-2-handoff.md §5 (twelve gotchas). CLAUDE.md — layering/security enforced.

Standing rules (Kelvin's): nothing static — every number/list/state from a table or live service;
animations required — the mock's literal delays, confirmed with getComputedStyle; terse working code
over write-ups; one feature at a time — build, show, wait for approval; multiple agents where work
is independent; gates before every hand-back: `npm run typecheck` clean, `npm run lint` exactly 9
pre-existing errors, `npx vitest run` green (58 files / 750 tests at last count). Run /code-review
(built-in, not the Thor AI plugin) on each slice's diff before handing back.

Environment: dev server via the `tomame-dev` launch config (never Bash); if port 3000 is held by
another chat's server from this directory, use it directly — Next refuses a second one. Stop the dev
server before switching branches; if served CSS lacks `tmPop`, `rm -rf .next`; if SSR disagrees with
`/api/cart` for one cookie, restart. Local test customer: kwame@tomame.local / Kwame-test-2026!
(has one address in the Kumasi zone and a pending order group). Extraction fixtures: phase-4-handoff §7.
BLOCKED until Kelvin acts: Paystack `transaction/initialize` returns "Invalid key" for the sk_test_ in
.env.local — ask for a valid test secret before proving the pay redirect/webhook live; apply the dev
public key to Vercel per runbook §8.

Then, in order, stopping for approval after each:
A. Phase 4 F4: the 390 px bag (responsive rendering of the desktop artboard with the detail phone's
   bottom-bar pattern — `padding:12px 20px 30px`, 52 px buttons — and `ownsMobileBottomBar` opt-in for
   /app/bag) + the Home freight-box card on the real open bag (mock line 123 fill graphic, `tmFill` on
   transform-origin bottom; marginal "add one more and save GH₵X" = saving at N+1 minus saving now,
   computed server-side in the bag service; card hidden when the bag is empty).
B. Phase 4 F5: delete what the bag replaced (old checkout page `/app/orders/[id]/checkout`,
   `useCreateOrder` duplicate in useOrders.ts if unused), the deferred F3 cleanups (collapse
   orderCharge/groupCharge and the two getActivePaymentFor* twins; single site_settings read on the
   bag page; no double re-price in checkoutBag), gates, append the outcome to phase-4-handoff §7.
C. Phase 5 (journeys + detail) per data map §5: migration 049 — `order_events`, `orders.order_no`
   (TM- + sequence, backfilled), `eta_from/eta_to`; write an order_event alongside each admin status
   change; `GET /api/orders/:id/events`. Decide with Kelvin first: message threads vs WhatsApp deep
   link for "Ask about this journey"/"Ask a buyer". Then the `v2-journeys` list (filter pills, stop
   rail, group-aware rows, "Pay now" for pending groups via initialize {orderGroupId}, "Buy again")
   and `v2-detail` (5-stop track over 7 statuses + events, carrier, ETA window, Deliver-to from the
   group's address snapshot, What you paid, item card, note). Collapse the duplicate POST /api/orders
   and fix the GET /api/orders envelope. 390 px views from `#v2-mobile` artboard 3.
D. Phase 6 (account) per data map §6: migration 050 — `profiles.phone`, `notify_email`,
   `whatsapp_opt_in`; left rail Profile / Addresses (reuse /api/addresses) / Payment (history from
   payments; no saved instruments) / Price watch / Notifications (read state + prefs) / Security.
E. Backend asks: A price-drop notifications (event + Resend template, `notified_at`/`notified_price_usd`
   on price_watches, batch job, admin threshold constant ~3%); B catalogue follow-ups; retrofit the
   price-watch job to the pg_cron → Vercel batch shape.
F. Release: merge the five order-status label maps into journey-stage.ts; publish policies.payment and
   .shipping or change the links; /faq, /contact, /policies onto the new design; fix CLAUDE.md's stale
   schema section; apply 048–050 to hosted dev then prod via the runbook and record versions; commit the
   infra/ fix and cherry-pick to main; Terraform apply of the dev Paystack public key; `npm run build`
   against dev; then, on Kelvin's explicit go, push `v2`.
```
