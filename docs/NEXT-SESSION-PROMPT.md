# Next session — start here

## 1. FIRST, AND BEFORE ANYTHING ELSE: the privilege escalation on production

**Any signed-in customer can make themselves an admin on prod right now.**
Verified against the hosted databases with read-only queries on 2026-09-13. Both
dev and prod are affected. Full write-up in `docs/RELEASE-STATUS-2026-09-13.md` §0.

The chain, all four links confirmed:

1. `authenticated` holds **table-wide UPDATE** on `public.profiles` (Supabase
   default privileges).
2. The RLS policy `Users can update own profile` is
   `USING (auth.uid() = id) WITH CHECK (auth.uid() = id)` — no column
   restriction. RLS *cannot* restrict an UPDATE to a subset of columns; only a
   column-level GRANT can.
3. `custom_access_token_hook` copies `profiles.role` into `app_metadata.role`
   every time a token is issued or refreshed.
4. Every admin gate — `src/lib/supabase/proxy.ts` and all `/api/admin/*` routes —
   trusts `app_metadata.role`.

A customer sends this at PostgREST with the publishable key from their own
browser, refreshes their session, and is a full administrator:

```
PATCH /rest/v1/profiles?id=eq.<their own id>
  apikey: <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>
  Authorization: Bearer <their own session JWT>
  { "role": "admin" }
```

### The fix

Already written, as part of migration 051. Apply **this fragment alone** — it is
independent of the rest of the migration run, so it does not have to wait for the
deploy:

```sql
BEGIN;
REVOKE UPDATE ON profiles FROM authenticated, anon;
GRANT UPDATE (first_name, last_name, bio, phone, whatsapp_opt_in, notify_email)
  ON profiles TO authenticated;
COMMIT;
```

**Prod first, then dev.** Apply through the Supabase Management API exactly as
`docs/DEPLOY-RUNBOOK-2026-09-12.md` §2 describes — never `supabase db push`, and
build the JSON with a real encoder rather than shell interpolation.

### Why this is safe against the code currently deployed

Checked before writing this down:

- The deployed `PATCH /api/app/me` writes only `first_name`, `last_name`, `bio`
  — all three are in the new grant list. (`phone`, `whatsapp_opt_in` and
  `notify_email` are in it for the Phase 6 account screen, which is not deployed
  yet; granting them early costs nothing.)
- **Every role change already runs through `createAdminClient()`** — service_role,
  which keeps `ALL` and is untouched by the REVOKE. Verified: `updateUserRole`
  in `src/features/users/services/users.service.ts` is only ever called with an
  admin client.
- `anon` cannot exploit the hole today (the policy needs an `auth.uid()`), but it
  holds the same pointless grant, so it is revoked too.

### Verify afterwards

As a normal signed-in customer, against the same project:
- updating a name or bio through the account screen still succeeds;
- `PATCH /rest/v1/profiles` with `{"role":"admin"}` is refused with
  *permission denied for table profiles*.

There is a matching check for the local stack in the Phase 6 work, which is where
this was first proven.

---

## 2. Then: Kelvin's test feedback

He is testing the branch and will send findings in this session. Take those next.

## 3. State of the branch

`v2`, nothing pushed, no hosted database touched. Local migrations run to **053**;
hosted is at **047**.

Gates: `npm run typecheck` clean · `npm run lint` **exactly 9** pre-existing
errors · `npx vitest run` **77 files / 1010 tests** · `npm run build` green.

Read `docs/RELEASE-STATUS-2026-09-13.md` for what shipped, what is deliberately
not done, the order of operations for the deploy, and the things found along the
way that outlive the session. The standing rules are in `CLAUDE.md` and
`docs/phase-2-handoff.md` §5.

### Known gaps, in Kelvin's priority order

- The escalation above.
- **Extraction coverage is the real problem behind most of the UX complaints.**
  Zyte answers `520 Website Ban` for MicroCenter, Browserless times out at 408,
  and several Target and Best Buy links come back readable but unpriced. The
  paste queue is now honest about all of it, but honesty is not a price. This
  deserves its own session.
- Phase 5 and Phase 6 animation delays were never confirmed with
  `getComputedStyle` — the agents that built those screens could not open a
  browser.
- `/contact` and `/policies` still carry the pre-redesign layouts. Their *bugs*
  are fixed (the form sent nothing; policies rendered raw markdown), but the
  pages have not been rebuilt on the v2 design. `/faq` has been.
- Backend ask B (catalogue follow-ups) is not started.
