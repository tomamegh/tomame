# Security review 2026-09-14: database layer

Read-only adversarial review of the Supabase Postgres layer (RLS, grants,
SECURITY DEFINER functions, storage) and the npm dependency tree. Companion to
`docs/SECURITY-REVIEW-2026-09-14.md`, which owns section 1. Nothing was
changed: every probe ran inside `BEGIN; ... ROLLBACK;` against the local stack
(`supabase_db_tomame`, migrations 001 to 059 applied), hosted projects were
not touched.

Personas used (all local, real rows):

| persona | pg role | JWT claims | notes |
|---|---|---|---|
| customer A (attacker) | `authenticated` | `sub` = `e059ccfd-…` (animtest@tomame.ca), `app_metadata: {}` | `profiles.role = user`; owns carts, quote_locks, watches |
| customer B (victim) | `authenticated` | `sub` = `23d2a152-…` (kwame@tomame.local) | owns orders, payments, deliveries, feedback |
| anon | `anon` | `{"role":"anon"}` | `auth.uid()` is null |
| admin by JWT only | `authenticated` | `sub` = `dbf345d4-…` (admin-slice-check), `app_metadata.role = admin` | `profiles.role = user`; tests whether the claim alone opens anything |
| admin by profile only | `authenticated` | `sub` = `ce9d2282-…` (builder-probe), `app_metadata: {}` | `profiles.role = admin`; tests the policies as written |

Migration numbering: `supabase/migrations/060_job_heartbeats.sql` already
exists on disk (not applied locally, `job_heartbeats` and `ops_cron_schedule`
are absent), so the fixes below are written for **061**. Also
`supabase_migrations.schema_migrations` does not record 059 even though
`run_reconcile_payments()` exists; whoever applied 059 did it outside the
migration runner. Worth reconciling before 060 and 061 go out.

## Findings at a glance

| id | severity | finding |
|---|---|---|
| DB-1 | Critical | Self-signup to admin: `handle_new_user()` copies `raw_user_meta_data.role` into `profiles.role`, and GoTrue lets any caller set that metadata on `/auth/v1/signup` |
| DB-2 | High | Five SECURITY DEFINER cron triggers (`run_reconcile_payments`, `run_catalog_scrape`, `run_sweep_extractions`, `recheck_price_watches`, `refresh_exchange_rates`) are EXECUTE-granted to `anon` and `authenticated`, so `POST /rest/v1/rpc/<fn>` with the publishable key fires the real cron route with the real `CRON_SECRET`, unlimited times |
| DB-3 | High | A customer can INSERT unlimited `price_watches` and `pending` `extraction_requests` through PostgREST; both drive paid vendor calls and neither is metered in `job_budgets` |
| DB-4 | Medium | `custom_access_token_hook` is executable by `anon`; it is a role oracle for any user id. The migration file revokes this, the live database does not reflect it |
| DB-5 | Medium | `TRUNCATE`, `TRIGGER`, `REFERENCES`, `MAINTAIN` are granted to `anon` and `authenticated` on all 37 public tables; TRUNCATE ignores RLS and wipes `audit_logs` as anon |
| DB-6 | Medium | Admin is decided by `profiles.role` in every policy but by the JWT claim in the app; demotion does not take effect until token refresh, and the two can disagree |
| DB-7 | Low | Admin UPDATE policies on `orders`, `order_deliveries`, `fixed_freight_items` have no `WITH CHECK`; dormant today because `authenticated` has no UPDATE grant there |
| DB-8 | Low | Full pricing internals (`pricing_groups`, `pricing_constants`, `category_pricing_map`, `exchange_rates`) are readable by any signed-in user; `fixed_freight_items` and `catalog_products` by anon |
| DB-9 | Info | `extraction_cache`, `policies`, `waitlist_signups` have RLS on, a SELECT grant, and zero policies (silent deny, correct) |
| ST-1 | None | Storage is sound: private buckets, zero `storage.objects` policies, service-role-only access behind two routes that re-authorize per request, no signed or public URLs anywhere |
| DEP-1 | Critical | `next` 16.2.9 carries two unauthenticated RCE advisories (fixed 16.3.3; latest 16.3.5) plus 13 high |
| DEP-2 | High | `sharp` 0.34.5 (admin image uploads) and `undici` 7.28.0 (cheerio, extraction fetches) are request-reachable and outdated |
| DEP-3 | Medium | `xlsx` 0.18.5 parses admin-uploaded spreadsheets; prototype pollution and ReDoS, no fix on npm |
| DEP-4 | Info | 15 nodemailer and 2 ws alerts are stale: neither package is in `package.json` or the lockfile on `main` |

## 2. Row Level Security, tested as a customer

### 2.1 Method

For every table in `pg_tables where schemaname = 'public'` (37 tables) and each
persona, four statements ran in their own rolled-back transaction:

```sql
begin;
set local role authenticated;   -- or anon
select set_config('request.jwt.claims',
  '{"sub":"e059ccfd-aa79-44f1-a994-8317fae60b30","role":"authenticated","app_metadata":{}}', true);
select count(*) from public.<t> where user_id is distinct from '<attacker>'::uuid;  -- rows of OTHER users visible
insert into public.<t> default values;                                              -- grant + WITH CHECK
update public.<t> set id = id where user_id is distinct from '<attacker>'::uuid;    -- rows of OTHER users writable
delete from public.<t>        where user_id is distinct from '<attacker>'::uuid;
rollback;
```

Tables without `user_id` were tested against all rows. Results were classified
as `permission denied` (no grant), `violates row-level security` (grant but
policy refused), `0 rows` (policy filtered everything), or a positive count.
The full matrix (592 cells) is reproducible with the generator kept in the
session scratchpad; the outcome summary is below.

### 2.2 Outcome summary

Customer A, cross-user (rows owned by others):

| result | tables |
|---|---|
| SELECT sees 0 foreign rows | every owner-scoped table: `orders`, `payments`, `order_deliveries`, `order_groups`, `carts`, `cart_items`, `delivery_addresses`, `notifications`, `quote_locks`, `price_watches`, `price_observations`, `extraction_requests`, `assisted_requests`, `order_events`, `order_photos`, `order_feedback`, `contact_messages`, `profiles` (own row only) |
| SELECT sees 0 rows, no policy at all | `extraction_cache`, `policies`, `waitlist_signups`, `audit_logs` (admin-only policy), `catalog_queries`, `consolidation_boxes`, `job_budgets`, `store_category_map` |
| SELECT sees all rows by design | `catalog_products` 315, `category_pricing_map` 67, `delivery_zones` 5, `exchange_rates` 1, `fixed_freight_items` 87, `media_overrides` 10, `pricing_constants` 15, `pricing_groups` 29, `regions` 3, `site_content` 41, `site_settings` 8 |
| INSERT | `permission denied` on 34 tables (no grant). Allowed by grant on `delivery_zones`, `extraction_requests`, `media_overrides`, `price_watches`, `regions`, `site_content`, `site_settings`; the admin-only ones refused by `WITH CHECK`, the two owner tables accepted rows (see DB-3) |
| UPDATE foreign rows | `permission denied` on 30 tables; `0 rows` on the 7 tables with an UPDATE grant (policy filtered) |
| DELETE foreign rows | `permission denied` on 30 tables; `0 rows` on the 7 with a DELETE grant |

Customer B on **own** rows, privileged columns (all inside one rolled-back transaction as kwame):

| statement | result |
|---|---|
| `update profiles set role='admin' where id=auth.uid()` | `42501 permission denied for table profiles` (column-level grant, 051, holds) |
| `update profiles set first_name=first_name where id=auth.uid()` | 1 row (the six allowed columns work) |
| `update orders set status='delivered' / admin_total_ghs=1 where user_id=auth.uid()` | `42501 permission denied` |
| `insert into orders (user_id) values (auth.uid())` | `42501 permission denied` (the `users can insert own orders` policy is dead: no grant) |
| `update payments set status='success'`, `order_groups.total_pesewas`, `quote_locks.expires_at`, `cart_items.quantity`, `notifications.status`, `order_feedback`, `order_photos.is_customer_visible`, `delivery_addresses`, `assisted_requests`, `extraction_cache`, `catalog_products.price_usd`, `catalog_queries.is_active`, `job_budgets.used` | `42501 permission denied` on every one |
| `delete from audit_logs`, `update audit_logs`, `delete from order_events` | `42501 permission denied` (append-only holds for the API roles) |
| `update extraction_requests set user_id='<other>' where user_id=auth.uid()` | `42501 new row violates row-level security policy` (WITH CHECK present, cannot hand rows to another user) |
| `update price_watches set user_id='<other>'` | same, refused |

Anon: sees only the 7 public-read tables (`catalog_products`, `delivery_zones`,
`fixed_freight_items`, `media_overrides`, `regions`, `site_content`,
`site_settings`); every write is `permission denied`; `auth.uid()` is null so
every owner policy evaluates to null and filters everything.

Admin by JWT claim only (`profiles.role = user`): identical to a plain
customer. No policy trusts `auth.jwt()`; every admin predicate is
`exists (select 1 from profiles where id = auth.uid() and role = 'admin')` or
`is_admin()`, which is the same test as a SECURITY DEFINER SQL function. This
is the right way round.

Admin by profile only (no claim): reads all 9 orders, 2 payments, 133 audit
rows, 6 profiles, 85 catalog queries, 3 assisted requests, and can UPDATE and
DELETE `delivery_zones` (5), `media_overrides` (10), `site_content` (41),
`site_settings` (8). Exactly the admin surface the policies describe.

Policy hygiene observed (from `pg_policies`):

- No `FOR ALL ... USING (true)` anywhere. The four `FOR ALL` policies
  (`delivery_zones`, `media_overrides`, `regions`, `site_content`,
  `site_settings` admin write; `extraction_requests` and `price_watches`
  owner write) all carry a matching `WITH CHECK`.
- No policy references `auth.jwt()` or `app_metadata`.
- `audit_logs` and `order_events`: SELECT-only grants, admin-only or owner
  policies, no DELETE or UPDATE path for `anon` or `authenticated`. Append-only
  holds for the API roles (see DB-5 for the TRUNCATE hole).
- Tables with RLS on, a SELECT grant, and no policy: `extraction_cache`,
  `policies`, `waitlist_signups`. Silent deny, which is safe. The app reads
  all three through the service role.

### 2.3 Findings

#### DB-1 (Critical): self-signup to admin through `handle_new_user()`

`public.handle_new_user()` (migration 001, still the live version, trigger
`on_auth_user_created` on `auth.users`) does:

```sql
INSERT INTO public.profiles (id, first_name, last_name, role)
VALUES (NEW.id, ..., COALESCE(NEW.raw_user_meta_data ->>'role', 'user'));
```

`raw_user_meta_data` is the `data` object of GoTrue's public signup call. Any
caller with the publishable key can send
`POST /auth/v1/signup {"email":..., "password":..., "data":{"role":"admin"}}`.
Email signup is enabled (`supabase/config.toml` `[auth.email] enable_signup =
true`, and `auth.service.ts` uses `supabase.auth.signUp`). The app never sets
`data.role` itself (`signUp({ email, password })`; admin creation in
`users.service.ts` and `create-admin.ts` writes `profiles.role` directly with
the service role), so nothing legitimate depends on this branch.

Demonstration (rolled back):

```sql
begin;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000abcd','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','attacker@example.com',
        '{"provider":"email","providers":["email"]}','{"role":"admin"}',now(),now());
select role from profiles where id = '00000000-0000-4000-8000-00000000abcd';
-- admin
select custom_access_token_hook('{"user_id":"00000000-0000-4000-8000-00000000abcd","claims":{"app_metadata":{}}}')
       -> 'claims' -> 'app_metadata';
-- {"role": "admin"}
rollback;
```

Blast radius: the attacker's profile row is `admin`, so every
`profiles.role = 'admin'` policy opens (all orders, payments, audit log,
profiles of every customer, pricing tables writable), and on the next token
issue the access-token hook stamps `app_metadata.role = admin` into the JWT,
which is what `canAccessAdmin()` checks, so every `/api/admin/*` route and the
admin UI open too. The full platform.

Fix (061):

```sql
-- Never take a role from client-writable metadata. Role is assigned by the
-- seed script or an admin through the service role, and only there.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, role)
  VALUES (
    NEW.id,
    NULLIF(left(NEW.raw_user_meta_data ->> 'first_name', 255), ''),
    NULLIF(left(NEW.raw_user_meta_data ->> 'last_name', 255), ''),
    'user'
  );
  RETURN NEW;
END;
$$;

-- Trigger functions cannot be called directly, but they should not be
-- EXECUTE-granted to the API roles either.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Belt and braces: a database-level constraint so no future trigger or
-- SECURITY DEFINER path can create a second role spelling.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check,
  ADD  CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));
```

Then, once on each environment, look for anyone who already used it:

```sql
select u.id, u.email, u.created_at, p.role, u.raw_user_meta_data
from auth.users u join public.profiles p on p.id = u.id
where p.role = 'admin' or u.raw_user_meta_data ? 'role';
```

Locally this returns only the three known admins (`builder-test`,
`builder-probe`, `kelanimdev`) and no metadata role. Run it on hosted before
anything else in this document.

#### DB-2 (High): cron trigger functions callable by anon over RPC

```sql
select proname, prosecdef,
       has_function_privilege('anon', oid, 'execute') anon_exec
from pg_proc where pronamespace = 'public'::regnamespace and prosecdef;
```

| function | SECURITY DEFINER | anon EXECUTE | authenticated EXECUTE |
|---|---|---|---|
| `run_reconcile_payments()` | yes | yes | yes |
| `run_catalog_scrape()` | yes | yes | yes |
| `run_sweep_extractions()` | yes | yes | yes |
| `recheck_price_watches()` | yes | yes | yes |
| `refresh_exchange_rates()` | yes | yes | yes |
| `custom_access_token_hook(jsonb)` | yes | yes | yes |
| `handle_new_user()` | yes | yes | yes |
| `is_admin()` | yes | yes | yes (needed by policies) |
| `claim_next_catalog_query(...)` | yes | no | no (045 revoked, correct) |
| `increment_job_budget(...)` | yes | no | no (045 revoked, correct) |

The ACL is the schema default (`postgres | public | f | anon=X, authenticated=X`),
inherited because migrations 026, 034, 042, 045, 049 and 059 created the
functions without a REVOKE. 045 and 060 show the project knows the pattern
(`revoke all on function ... from public, anon, authenticated`); it was not
applied to the five HTTP triggers.

PostgREST exposes every function in `public` that the role may execute as
`POST /rest/v1/rpc/<name>`. With the publishable key and no session, this
works locally (rolled back):

```sql
begin; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true);
select run_reconcile_payments();   -- OK (WARNING: app_url not configured, because the local vault is empty)
select run_catalog_scrape();       -- OK
select run_sweep_extractions();    -- OK
select recheck_price_watches();    -- OK
select refresh_exchange_rates();   -- OK
rollback;
```

On hosted, where `vault.decrypted_secrets` holds `app_url` and `cron_secret`,
each call enqueues `net.http_get('<app>/api/cron/<job>', Authorization: Bearer
<CRON_SECRET>)`. The caller never sees the secret (the function returns void
and `net._http_response` is empty for the API roles), but they get to fire
every job on demand and without limit: the sweep and price-watch jobs pay for
vendor extractions on every run and are not metered in `job_budgets` (only the
catalogue scrape is, per `admin-watch-format.ts`), `refresh_exchange_rates`
burns the exchange-rate API quota, `run_reconcile_payments` hits Paystack's
verify endpoint for every open payment, and each call is a paid Vercel
invocation of up to 300 s. Thousands of calls a minute cost nothing to send.

Fix (061). pg_cron runs jobs as the owner of the job, which is `postgres`, so
`postgres` (already the owner) is the only role that needs EXECUTE:

```sql
REVOKE ALL ON FUNCTION public.run_reconcile_payments()  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_catalog_scrape()      FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_sweep_extractions()   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recheck_price_watches()   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.refresh_exchange_rates()  FROM PUBLIC, anon, authenticated, service_role;

-- Trigger bodies; not callable directly but no reason to leave them exposed.
REVOKE ALL ON FUNCTION public.update_orders_updated_at()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_order_deliveries_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_user_updated_at()             FROM PUBLIC, anon, authenticated;

-- Stop the next one inheriting the same default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
```

Keep `is_admin()`, `search_catalog_products()` and `catalog_categories()`
granted: the first is used inside policies evaluated as the caller, the other
two are the public catalogue read path (both SECURITY INVOKER, both only read
`catalog_products`, which anon may read anyway).

After 061, re-verify with:

```sql
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and (has_function_privilege('anon', oid, 'execute') or has_function_privilege('authenticated', oid, 'execute'));
-- expected: catalog_categories, is_admin, search_catalog_products
```

#### DB-3 (High): unlimited paid work queued by a customer through PostgREST

Two tables give `authenticated` full DML with an owner policy:

```
extraction_requests | authenticated | DELETE,INSERT,SELECT,UPDATE   (046)
price_watches       | authenticated | DELETE,INSERT,SELECT,UPDATE   (041, 052)
policy "extraction_requests owner write" FOR ALL USING (user_id = auth.uid()) WITH CHECK (same)
policy "price_watches owner write"       FOR ALL USING (user_id = auth.uid()) WITH CHECK (same)
```

The policies are correct about ownership (DB-2.2 shows a row cannot be handed
to another user). The problem is that the app never uses these grants: every
write in `src/db/queries/price-watches.ts` and
`src/db/queries/extraction-requests.ts` goes through `createAdminClient()`.
The grants exist only for an attacker, and both tables are work queues for
paid vendor calls:

- `listQueuedExtractionRequests()` picks `status = 'pending'` ordered by
  `updated_at`, and the sweep runs a hedged extraction (ScraperAPI, Oxylabs,
  Zyte, Claude) for each.
- The price-watch job loads active watches ordered by `last_checked_at` (8 per
  run, every 10 minutes) and extracts each one. Not metered in `job_budgets`.

Demonstration as customer A (rolled back):

```sql
begin; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e059ccfd-aa79-44f1-a994-8317fae60b30","role":"authenticated","app_metadata":{}}',true);

insert into extraction_requests (user_id, url_hash, product_url, status, attempts)
select auth.uid(), md5(g::text), 'https://www.amazon.com/dp/B0' || g, 'pending', 0
from generate_series(1, 500) g;                                      -- 500 rows

update extraction_requests set status = 'pending', attempts = 0, extraction_cache_id = null
where user_id = auth.uid();                                          -- 502 rows re-queued

update extraction_requests
set extraction_cache_id = (select id from extraction_cache where user_id <> auth.uid() limit 1)
where user_id = auth.uid();                                          -- 502 rows repointed at someone else's snapshot

insert into price_watches (user_id, product_url, url_hash, product_name, baseline_price_usd, baseline_total_ghs, is_active)
select auth.uid(), 'https://www.amazon.com/dp/B0' || g, md5(g::text), 'x', 1, 1, true
from generate_series(1, 500) g;                                      -- 500 rows
rollback;
```

Over HTTP this is `POST /rest/v1/price_watches` with the user's session JWT
and a JSON array body; the per-user cap and URL validation in
`watches.service.ts` never run. The `status`, `attempts`, `started_at`,
`error` and `extraction_cache_id` columns are also writable, so a customer can
also flip a `failed` job back to `pending` forever (the `MAX_EXTRACTION_ATTEMPTS
= 3` guard is a column they control) and can point their request at any cache
row (low value: `extraction_cache` is a shared product snapshot and
`/api/extractions/[id]` is keyed by the cache id, not the request id, so this
leaks nothing extra).

Fix (061), no app change needed because the app already uses the service role:

```sql
REVOKE INSERT, UPDATE, DELETE ON public.extraction_requests FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.price_watches       FROM authenticated, anon;
DROP POLICY IF EXISTS "extraction_requests owner write" ON public.extraction_requests;
DROP POLICY IF EXISTS "price_watches owner write"       ON public.price_watches;
-- "… owner read" SELECT policies stay; the account screen reads through the user client.

-- While here: the same shape on store_category_map (043) grants UPDATE with an
-- admin-only policy. Admin corrections happen through the service role too.
REVOKE UPDATE ON public.store_category_map FROM authenticated;
DROP POLICY IF EXISTS "store_category_map admin correct" ON public.store_category_map;
```

If the product ever wants customers to write watches through the user client,
add a per-user cap trigger and a `CHECK (status in (...))` first, and grant
INSERT on an explicit column list that excludes the job-state columns.

#### DB-4 (Medium): `custom_access_token_hook` is a public role oracle, and the migration says otherwise

`supabase/migrations/20260323010214_custom_access_token_hook.sql` ends with
`revoke execute on function public.custom_access_token_hook from authenticated,
anon, public;`. The live database disagrees:

```sql
select proacl from pg_proc where proname = 'custom_access_token_hook';
-- {postgres=X/postgres,supabase_auth_admin=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

So either the revoke never ran here, or something re-granted after it. Either
way, as anon (rolled back):

```sql
select custom_access_token_hook('{"user_id":"f98b7fd0-3462-45df-ad3e-5f8106db8544","claims":{}}');
-- {"claims": {"app_metadata": {"role": "admin"}}, "user_id": "f98b7fd0-…"}
select custom_access_token_hook('{"user_id":"23d2a152-868a-4a52-86d3-fc8635c7f47a","claims":{}}');
-- {"claims": {"app_metadata": {"role": "user"}}, …}
```

Any visitor can ask "is this uuid an admin" through `/rest/v1/rpc/custom_access_token_hook`.
User ids appear in order numbers, photo paths and audit rows, so this is a
useful step in targeting the account that matters. Only GoTrue
(`supabase_auth_admin`) should be able to run it.

Fix (061), idempotent so it is safe on an environment where the original
revoke did land:

```sql
REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
```

And check hosted right away with the `proacl` query above; the memory note
says the hook is enabled there, so the function exists.

#### DB-5 (Medium): TRUNCATE ignores RLS and is granted to the API roles on every table

The project revokes INSERT/UPDATE/DELETE per table but never touched the rest
of Supabase's default table ACL. Every public table shows:

```
grantee        | privileges
anon           | REFERENCES, SELECT, TRIGGER, TRUNCATE   (+ MAINTAIN on PG17)
authenticated  | REFERENCES, SELECT, TRIGGER, TRUNCATE
```

`TRUNCATE` is not a row operation, so RLS does not apply. Rolled back:

```sql
begin; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true);
select count(*) from audit_logs;   -- 0 (RLS hides every row)
truncate audit_logs;               -- succeeds, no error
rollback;
select count(*) from audit_logs;   -- 133 again
```

`truncate orders cascade` and `truncate profiles cascade` also run as anon and
would take payments, order_events, order_photos, notifications, carts and the
audit log with them.

Reachability today: PostgREST issues only SELECT/INSERT/UPDATE/DELETE and
nobody can connect as `anon` directly, so this is not exploitable through the
public API as the code stands. It becomes a one-line wipe of the append-only
audit trail the first time a SECURITY INVOKER function with dynamic SQL, a
`pg_graphql` extension, or any SQL injection into a user-role code path
appears. The append-only guarantee in CLAUDE.md is currently a grant away.

Fix (061):

```sql
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM anon, authenticated', t.tablename);
    -- MAINTAIN exists from PostgreSQL 17; harmless no-op guard for older locals.
    IF current_setting('server_version_num')::int >= 170000 THEN
      EXECUTE format('REVOKE MAINTAIN ON public.%I FROM anon, authenticated', t.tablename);
    END IF;
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
-- and the supabase_admin default, which is where "GRANT ALL" for new tables comes from:
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
```

(`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` needs to run as
`supabase_admin` or a member; on hosted use the SQL editor, which runs as
`postgres` with the needed membership. If it errors with 42501, keep only the
`postgres` line and add an explicit `REVOKE` to each future CREATE TABLE.)

Also worth a hard stop on the two append-only tables regardless of grants:

```sql
CREATE OR REPLACE FUNCTION public.refuse_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501'; END $$;
CREATE TRIGGER audit_logs_append_only   BEFORE UPDATE OR DELETE OR TRUNCATE ON public.audit_logs   FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_mutation();
CREATE TRIGGER order_events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON public.order_events FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_mutation();
```

That applies to the service role and `postgres` too, which is the point.

#### DB-6 (Medium): two sources of truth for "admin"

Every policy and `is_admin()` read `profiles.role`. `canAccessAdmin()` in
`src/lib/auth/admin-access.ts` reads `app_metadata.role` from the JWT, which
`custom_access_token_hook` copies from `profiles.role` at token issue. The
matrix confirms the database side is consistent (a claim without the profile
row opens nothing), but the two disagree in time:

- Demoting or deleting an admin in `profiles` leaves their existing JWT valid
  until expiry (default 1 h) and their refresh token keeps minting admin
  tokens until the session is revoked. The API routes trust the claim.
- Locally the hook is not enabled, so `builder-probe` and `kelanimdev` are
  admins to the database (they read all 9 orders through PostgREST in the
  matrix) and customers to the app. On hosted the two agree only because the
  hook runs; a hosted hook outage would silently degrade admins to customers
  in the app while the database still trusts them.

Fix: not a migration. When `profiles.role` changes, revoke the user's sessions
(`auth.admin.signOut(userId, 'global')` from `users.service.ts`), and have the
admin guard re-read `profiles.role` through the service role for mutating
admin routes (payment, order status, role changes). Note it here so the
`SECURITY-REVIEW-2026-09-14.md` owner can pick it up on the app side.

#### DB-7 (Low): UPDATE policies without WITH CHECK, and dead policies

```
orders               | admins can update orders            | UPDATE | USING admin | WITH CHECK <none>
order_deliveries     | admins can update order deliveries  | UPDATE | USING admin | WITH CHECK <none>
fixed_freight_items  | Admins can update fixed freight ... | UPDATE | USING admin | WITH CHECK <none>
orders               | users can insert own orders         | INSERT | WITH CHECK (auth.uid() = user_id)
```

None is reachable: `authenticated` has no UPDATE grant on the three tables and
no INSERT grant on `orders`, so the matrix returned `permission denied`. They
are misleading rather than dangerous. Either drop them (the app mutates these
tables through the service role) or complete them:

```sql
DROP POLICY IF EXISTS "admins can update orders"           ON public.orders;
DROP POLICY IF EXISTS "admins can update order deliveries" ON public.order_deliveries;
DROP POLICY IF EXISTS "Admins can update fixed freight items" ON public.fixed_freight_items;
DROP POLICY IF EXISTS "Admins can insert fixed freight items" ON public.fixed_freight_items;
DROP POLICY IF EXISTS "admins can insert order deliveries" ON public.order_deliveries;
DROP POLICY IF EXISTS "users can insert own orders"        ON public.orders;
```

#### DB-8 (Low): pricing internals readable by any account

`pricing_groups` (29 rows), `pricing_constants` (15), `category_pricing_map`
(67) and `exchange_rates` have `SELECT ... USING (true)` for `authenticated`;
`fixed_freight_items` (87) and `catalog_products` (315) for anon as well. The
quote is priced server-side from these, so the browser does not need the raw
`value_fee_pct`, `freight_rate_per_lb`, `handling_fee_usd` or
`consolidation_saving_pct`. A signed-up competitor can read the whole fee
schedule with one `GET /rest/v1/pricing_constants?select=*`. If the app reads
these only through the service role (the calculator lives in
`src/lib/pricing/calculator.ts`, server-only), revoke:

```sql
REVOKE SELECT ON public.pricing_groups, public.pricing_constants,
                 public.category_pricing_map, public.exchange_rates
FROM anon, authenticated;
-- keep admin read for the pricing screen if it uses the user client:
-- (the existing admin policies stay; SELECT for admins then needs the grant back,
--  so check src/db/queries/pricing*.ts first)
```

Verify with `grep -rn 'from("pricing_' src/db/queries` which client each
reader uses before shipping this one; it is the only fix here that can break a
screen.

#### DB-9 (Info): RLS on, grant present, no policy

`extraction_cache`, `policies`, `waitlist_signups` are silent-deny for the API
roles. Correct. `carts` rows with `user_id null` (4 guest carts) are likewise
unreadable by anyone but the service role, which matches the cookie-keyed
guest-cart design.

## 3. Storage

Both buckets are private and stay private:

```sql
select id, public from storage.buckets;
-- marketing-media | f
-- parcel-photos   | f
select count(*) from pg_policies where schemaname = 'storage';   -- 0
select relrowsecurity from pg_class where oid = 'storage.objects'::regclass;  -- t
```

Neither migration 040 nor 054 creates a `storage.objects` policy, and the
comment in both says why: nothing reads the bucket except a service-role route.
With RLS on and zero policies, the Storage API refuses the API roles
completely. Tested as customer A (rolled back):

| statement as `authenticated` | result |
|---|---|
| `select count(*) from storage.objects` | 0 (13 objects exist) |
| `select count(*) from storage.objects where bucket_id = 'parcel-photos'` | 0 |
| `insert into storage.objects (bucket_id, name, owner_id) values ('parcel-photos', 'x/evil.jpg', auth.uid())` | `42501 new row violates row-level security policy` |
| `delete from storage.objects where bucket_id = 'parcel-photos'` | refused by Supabase's own guard trigger |
| `select count(*) from storage.buckets` | 0 |

So a customer cannot list, read, upload, overwrite or delete any object
through `storage/v1`, including their own parcel photos. Object paths carry
only the order id (`orders/<order uuid>/<random>.webp`), no customer id or
name.

Code paths (`grep -rn 'createSignedUrl\|getPublicUrl\|createSignedUploadUrl\|storage.from(' src`):

- No `createSignedUrl`, `createSignedUploadUrl` or `getPublicUrl` anywhere in
  `src/`. There is no URL that can leak.
- The only `storage.from(...)` calls are in
  `src/features/media/services/image-upload.ts` (`upload`, `download`,
  `remove`), all on `createAdminClient()`, all `server-only`.
- `GET /api/media/[key]` serves `marketing-media` and only for keys in the
  static manifest (`isMarketingImageKey`), so it cannot enumerate the bucket.
  Public by design; long cache.
- `GET /api/order-photos/[photoId]` serves `parcel-photos`.
  `readOrderPhotoForViewer` loads the row, refuses non-admins when
  `is_customer_visible` is false, then loads the order owner with the service
  role and refuses if it is not the caller. Every refusal is a 404, response is
  `private, no-store`, `CSP: default-src 'none'; sandbox`, rate-limited per IP.
  Re-authorised on every request, so a copied URL is worthless to anyone else.

No finding. The one thing to keep an eye on is DB-5's TRUNCATE grant, which
also exists on `storage.objects` for `authenticated` (Supabase-owned default,
out of scope for a project migration).

## 4. Dependencies

Source: `gh api 'repos/{owner}/{repo}/dependabot/alerts?state=open&per_page=100' --paginate`
on 2026-09-14. 131 open alerts: 2 critical, 58 high, 62 medium, 9 low. Local
`main` equals `origin/main` (0 ahead, 0 behind), so the lockfile Dependabot
scanned is the one reviewed. Cross-checked with `npm outdated`, `npm audit
--omit=dev`, `npm ls <pkg> --all` and a grep of `src/` imports. Nothing was
installed.

### 4.1 Triage by reachability

**A. Runtime and request-reachable (matter):**

| package | installed | alerts | how it is reached | fixed in |
|---|---|---|---|---|
| `next` | 16.2.9 | 2 critical (GHSA-2xp9-vwfh-vxw4 RCE in Image Optimization via AVIF; GHSA-p293-qw3h-jr36 RCE on Windows hosts), 13 high (middleware/proxy bypass x5, SSRF x3, DoS x4, cache confusion), 12 medium, 3 low | the framework; `next/image` is used on public pages | 16.3.3 (latest 16.3.5) |
| `sharp` | 0.34.5 | 2 high (libvips CVE-2026-33327/33328/35590/35591; libheif) | `image-upload.ts` re-encodes admin-uploaded marketing and parcel photos; attacker must be an admin, or DB-1 | 0.35.4 |
| `undici` | 7.28.0 | 5 high per `npm audit` (response desync, cross-user cache disclosure, CRLF via blob type, cookie injection) | transitive via `cheerio` 1.2.0; the extraction HTML tier fetches attacker-chosen store URLs | 7.29.1 |
| `xlsx` | 0.18.5 | 2 high (prototype pollution GHSA-4r6h-8v6p-xvw6, ReDoS GHSA-5pgg-2g8v-p4x9) | `pricing-import-export.service.ts` calls `XLSX.read(fileBuffer)` on an admin-uploaded workbook | none on npm; 0.20.3 from cdn.sheetjs.com |
| `postcss` | 8.5.15 (plus 8.4.31 nested under next) | 2 high (arbitrary `.map` read via sourceMappingURL), 2 medium | build only in practice (Tailwind pipeline); no request path parses attacker CSS | 8.5.23 (latest 8.5.28) |

**B. Listed under `dependencies` but tooling only (not imported from `src/`, never run in a request):**

`eslint` 9.39.4 chain: `flatted` 3.4.2 (2 high, fixed 3.4.2 covers one; second says `<= 3.4.1` so already fixed locally, alert stale), `minimatch` 3.1.5 (7 high across 3.x/9.x/10.x, need 3.1.4+/9.0.7/10.2.3), `brace-expansion` 1.1.15 and 5.0.6 (7 high, need 1.1.18 / 5.0.7), `js-yaml` 4.2.0 (3 high, need 4.3.2). `@babel/core` 7.29.7, `browserslist` 4.28.2 (2 high, need 4.28.7), `baseline-browser-mapping` 2.10.37, `nanoid` 3.3.12 (need 3.3.18) via `postcss`, `picomatch` 2.3.2 / 4.0.4 (alerts say fixed at exactly those versions; stale). These ship in the production `node_modules` because `eslint`, `eslint-config-next`, `typescript`, `@types/*`, `shadcn` and `postcss` sit in `dependencies` instead of `devDependencies`. Moving them shrinks the deploy and turns most of the list into build-time noise Dependabot will still report but `npm audit --omit=dev` will not.

**C. `devDependencies` only (build-time, cannot be reached by a request):**

`hono` 4.12.25 and `@hono/node-server` 1.19.14 (32 alerts, all via `shadcn` > `@modelcontextprotocol/sdk`), `fast-uri` 3.1.2 (7 high, via `shadcn`), `ip-address` 10.2.0, `qs` 6.15.2, `esbuild` 0.28.1 (via `vitest`), `postcss-selector-parser`. Upgrade `shadcn` and `vitest` when convenient; none of these run on Vercel.

**D. Stale (dependency not present):**

`nodemailer` (alerts 24, 37, 71, 72, 78, 79, 80, 140 to 148; some claim `manifest_path: package.json`) and `ws` (64, 81). Neither is in `package.json` or `package-lock.json` on `main`; `git log -S nodemailer -- package.json` shows it left with "Dev (#25)". Alert 148 was created 2026-09-10 against `package.json`, which suggests Dependabot scanned a non-default branch or a fork; dismiss as "not used" or let the next scan close them. `@humanfs/node` 0.16.8 (alert says `< 0.16.8`) is likewise already fixed.

### 4.2 What `npm audit --omit=dev` says

43 vulnerabilities (1 critical, 9 high, 33 moderate) across `next`, `postcss`
(also nested under `next`), `sharp`, `undici`, `xlsx`. "fix available via `npm
audit fix`" for the first four (all semver-compatible), "No fix available" for
`xlsx`.

### 4.3 Concrete upgrade commands (not run; all read-only in this review)

Clears both criticals and every request-reachable high in one commit:

```bash
npm install next@16.3.5 eslint-config-next@16.3.5 sharp@0.35.4 postcss@8.5.28
npm update undici             # cheerio allows ^7; lands 7.29.1
```

Then the tooling chain, which `npm audit fix` covers because each is a
semver-compatible bump inside the lockfile:

```bash
npm audit fix                 # js-yaml 4.3.2, minimatch, brace-expansion, browserslist 4.28.7,
                              # nanoid 3.3.18, flatted, baseline-browser-mapping, undici
```

`xlsx` has no npm release past 0.18.5. SheetJS publishes fixed builds only from
its own CDN:

```bash
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

Or, since the only reader is an admin-uploaded pricing sheet, accept CSV there
and drop the parser: the export side (`XLSX.write`) is not affected.

Housekeeping that changes what ships rather than what is vulnerable:

```bash
npm install --save-dev eslint eslint-config-next typescript @types/node @types/react @types/react-dom shadcn
```

Verify after upgrading: `npm run build && npm run typecheck && npm test`, then
`npm audit --omit=dev` should report only `xlsx` (or nothing, with the CDN
build), and `gh api .../dependabot/alerts?state=open` should drop to the
`hono`/`shadcn` dev-only set plus the stale nodemailer/ws ones to dismiss.

## Appendix: order of operations for 061

1. Run the DB-1 audit query on hosted first; act on any unexpected admin
   before deploying anything.
2. `061_lock_down_api_roles.sql`: DB-1 trigger rewrite and CHECK, DB-2 function
   REVOKEs and default privilege, DB-4 hook grant, DB-3 table REVOKEs and
   policy drops, DB-5 TRUNCATE/TRIGGER/REFERENCES/MAINTAIN sweep and
   append-only triggers, DB-7 dead policy drops. Everything except DB-8 is
   invisible to the app because the app uses the service role for all of it.
3. Reconcile `schema_migrations` (059 missing) and apply 060 before 061 so the
   runner does not skip it.
4. Dependencies: `next`/`sharp`/`postcss`/`undici` bump in its own commit,
   deployed and smoke-tested (image upload, a paste-and-quote, the admin
   pricing export) before the tooling `npm audit fix`.
