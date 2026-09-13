# Prompt for the session that continues v2 (written 2026-09-13, after Phase 4 F2)

Paste everything between the fences into a fresh Claude Code session opened at the repo root.

```
Continue the Tomame v2 redesign on branch `v2`. Nothing is pushed to GitHub and nothing must be
pushed until v2 is complete — hosted dev/prod deploy from the remote.

Read, in this order, before touching anything:
1. docs/phase-4-handoff.md — §1 the approved Phase 4 decisions (do not reopen), §7 what F1/F2
   built and the three traps found (QueryClient leak, stale .next, stale RSC modules), §8 the F3
   build list.
2. docs/HANDOFF-2026-09-12.md §4 (earlier approved decisions) and docs/phase-3-handoff.md §9
   (Phase 3 gotchas: total_usd, quote_assurance, AppBottomTabs opt-in, QuoteGapFillers).
3. docs/DEPLOY-RUNBOOK-2026-09-12.md §2/§3/§8 — hosted DBs are at 047; 048 exists locally only.
   Never `supabase db push`; apply via the Management API in BEGIN/COMMIT and record the version.
   Vercel env only through Terraform (§4/§8).
4. docs/redesign-data-map.md Phase 4 (~line 422), Phase 5 (~565), Phase 6 (~680).
5. docs/phase-2-handoff.md §5 (twelve gotchas). CLAUDE.md — layering/security enforced.

Standing rules (Kelvin's): nothing static — every number/list/state from a table or live service;
animations required — the mock's literal delays, confirmed with getComputedStyle; terse working code
over write-ups; one feature at a time — build, show, wait for approval; multiple agents where work
is independent; gates before every hand-back: `npm run typecheck` clean, `npm run lint` exactly 9
pre-existing errors, `npx vitest run` green (53 files / 707 tests at last count).

Environment notes: dev server via the `design-kit`/`tomame-dev` launch configs (never Bash);
stop the dev server before switching branches; if the served CSS lacks `tmPop`, `rm -rf .next`
and restart; if SSR disagrees with `/api/cart` for the same cookie, restart the server; verify
per-viewer pages with two cookie jars via curl. Local fixtures are listed in phase-4-handoff §7.
Ask Kelvin for the real `pk_test_` Paystack public key (dev Vercel still has a placeholder) and
apply it per runbook §8 when it is in .env.local.

Then, in order, stopping for approval after each:
A. Phase 4 F3 per docs/phase-4-handoff.md §8: addresses, payment channels reshaped in 048 (edit
   in place — unreleased), POST /api/cart/checkout → order_groups + N orders + lock consumption,
   POST /api/payments/initialize with orderGroupId, webhook/callback fan-out, the Deliver-to card
   and the Pay rail on /app/bag (mock lines 236–243, 258–267).
B. Phase 4 F4: 390 px bag (responsive rendering of the desktop artboard with the detail phone's
   bottom-bar pattern, `ownsMobileBottomBar` opt-in) + the Home freight-box card on the real open
   bag (mock line 123 fill graphic, `tmFill` on transform-origin bottom; marginal "add one more and
   save GH₵X" = saving at N+1 minus saving now, computed server-side).
C. Phase 4 F5: delete what the bag replaced (old checkout page paths, `useCreateOrder` duplicate
   in useOrders.ts if unused, PAYMENT_METHODS), gates, append the outcome to phase-4-handoff §7.
D. Phase 5 (journeys + detail), E. Phase 6 (account), F. backend asks (price-drop notifications,
   catalogue follow-ups), G. release checks — all as listed in the original v2 prompt
   (docs/NEXT-SESSION-PROMPT.md history) and docs/HANDOFF-2026-09-12.md §8.
```
