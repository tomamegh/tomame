# Deploy runbook — hosted Supabase + Vercel env (written 2026-09-12)

Everything in this file is verified against the live projects, not assumed. It is
the remaining work to get the committed code deployable. **Read §1 before running
anything** — the obvious command is the destructive one here.

---

## 1. The one thing that will break production

**Do NOT run `supabase db push` against either hosted project.**

Neither `tomame-dev` (`oyrdwbmojmsuknnlevgt`) nor `tomame-prod`
(`zvrjdwvjtzjmtnrawrta`) has a `supabase_migrations.schema_migrations` table —
verified 2026-09-12, the relation does not exist on either. But both databases
already carry migrations **001–035** plus the custom access-token hook.

With no history table, `db push` considers every migration unapplied and re-runs
`001` onward into a database that already has those objects. Some statements are
`IF NOT EXISTS`, many are not, and the run will fail partway — leaving partial
state on a database that currently holds real data.

The history table must be **created and backfilled first** (§3), then migrations
036–047 applied in order.

### Evidence the hosted schema is at 001–035

| Check | dev | prod |
|---|---|---|
| `extraction_cache` UNIQUE on `url_hash` (035) | present | present |
| `orders.admin_total_ghs` (031) | present | present |
| `pg_cron`, `pg_net` | installed | installed |
| `pg_trgm` (045 installs it) | absent | absent |
| `pricing_groups` rows (030/032) | 29 | 29 |
| `custom_access_token_hook` function | present | present |
| `cron.job` names | `fetch-exchange-rates`, `cleanup-extraction-cache` | same |
| **live rows** | 4 orders / 3 profiles | **3 orders / 2 profiles** |

`policies` is **empty on both** — see §5.

---

## 2. How to talk to the hosted databases

There is no `psql` on this host and no `supabase` CLI on PATH (`npx supabase`
works). The Supabase **Management API** runs arbitrary SQL with only the access
token, which is already on disk:

- Token: the `supabase_access_token` value in `infra/secrets.auto.tfvars`
  (gitignored). Do not print it or commit it.
- Endpoint: `POST https://api.supabase.com/v1/projects/<ref>/database/query`
  with `{"query": "<sql>"}` and `Authorization: Bearer <token>`.

Build the JSON with a real JSON encoder, not shell string interpolation — shell
quoting mangles `%` and nested quotes and has already produced malformed SQL once.

**Wrap every migration in `BEGIN; … COMMIT;`** so each one applies fully or not at
all. Verified safe: no migration in 036–047 uses `CREATE INDEX CONCURRENTLY` or
anything else that cannot run inside a transaction.

Alternative if you prefer the CLI: link with
`npx supabase link --project-ref <ref>` (needs the database password, which lives
in Terraform state — `terraform output -raw`, see §4). The API route avoids
needing that password at all.

---

## 3. Migrations — do dev first, verify, then prod

### 3a. Create and backfill the history table (both projects, dev first)

```sql
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
insert into supabase_migrations.schema_migrations (version, name) values
('001','create_profiles_table'),('002','create_audit_logs_table'),
('003','create_pricing_config_table'),('004','create_orders_table'),
('005','create_payments_table'),('008','add_order_tracking'),
('010','add_extraction_data'),('011','seed_pricing_config'),
('012','create_exchange_rates_table'),('013','add_order_review_columns'),
('014','create_fixed_freight_items_table'),('015','seed_fixed_freight_items'),
('016','create_pricing_constants_table'),('017','create_order_deliveries_table'),
('018','add_channel_to_payments'),('019','create_notifications_table'),
('020','add_minimum_tax_constant'),('021','drop_unused_pricing_tables'),
('022','drop_unused_pricing_tables'),('023','create_extraction_cache_table'),
('024','add_extraction_cache_fk_to_orders'),('025','add_user_id_to_extraction_cache'),
('026','exchange_rates_pg_cron'),('027','recreate_pricing_constants_table'),
('028','create_pricing_groups_table'),('029','create_category_pricing_map_table'),
('030','seed_pricing_groups'),('031','add_admin_pricing_to_orders'),
('032','seed_expanded_pricing_groups'),('033','create_policies_table'),
('034','cron_settings_via_vault'),('035','extraction_cache_product_keyed'),
('20260323010214','custom_access_token_hook')
on conflict (version) do nothing;
```

This records what is **already true** of those databases. It applies no DDL.

### 3b. Apply 036 → 047 in order

Strictly ascending, one at a time, each wrapped in `BEGIN/COMMIT`, checking the
result before starting the next:

```
036_create_marketing_content_tables   039_create_media_overrides   042_price_watches_cron
037_seed_marketing_content            040_media_uploads            043_store_category_map
038_seed_landing_faqs                 041_create_price_watches…    044_create_quote_locks
045_catalog                           046_extraction_requests      047_quote_assurance_content
```

After each success, record it:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('036','create_marketing_content_tables') on conflict (version) do nothing;
```

Notes that matter:

- **041 and 046 are a pair.** `extraction_requests` was split out of 041 into 046
  so the extraction pipeline does not depend on Phase 2 schema. 041 no longer
  creates that table; 046 does. Apply both, in order.
- **045 installs `pg_trgm`** (`create extension if not exists`). Expected.
- **042, 044, 045 touch `cron.job`.** They unschedule-then-schedule by name, so
  re-running is safe. Expect these jobs afterwards: `recheck-price-watches`
  (042), `cleanup-quote-locks` + a modified `cleanup-extraction-cache` (044),
  `catalog-scrape` (045).
- **044 was edited in place** before release to add `quote_locks.fx_rates`. The
  file on disk is correct; nothing special to do.

### 3c. Verify after dev, before touching prod

```sql
select count(*) as public_tables from pg_tables where schemaname='public';
-- expect 13 + the new ones (site_content, site_settings, regions, delivery_zones,
-- waitlist_signups, media_overrides, price_watches, price_observations,
-- extraction_requests, store_category_map, quote_locks, catalog_queries,
-- catalog_products, job_budgets)

select jobname, schedule from cron.job order by jobname;
select count(*) from site_content where kind='quote_assurance';  -- expect 3
select count(*) from catalog_queries;                            -- expect 84
select version from supabase_migrations.schema_migrations order by version;
```

Then smoke-test the app against dev before repeating the whole of §3 on prod.

### 3d. Prod

Same steps. **Prod has live rows** (3 orders, 2 profiles), so take a backup /
confirm PITR first, and get Kelvin's explicit go-ahead before starting.

---

## 4. Vercel env vars — `OXYLABS_USERNAME`, `OXYLABS_PASSWORD`, `ZYTE_API_KEY`

**Set these through Terraform, not the Vercel dashboard or CLI.** `infra/main.tf`
warns that a value changed in a vendor dashboard goes stale in state and the next
`terraform apply` pushes the old one back. There is also no `vercel` CLI on this
host.

The three keys are already allow-listed as `optional_third_party_secrets` in
`infra/variables.tf:290-292`, and their live values are in `.env.local`.

1. Add them to `optional_third_party_secrets` in `infra/secrets.auto.tfvars`
   (gitignored; the shape is in `secrets.auto.tfvars.example:39-47`):

   ```hcl
   optional_third_party_secrets = {
     OXYLABS_USERNAME = "…"
     OXYLABS_PASSWORD = "…"
     ZYTE_API_KEY     = "…"
   }
   ```

   That file currently holds only `vercel_api_token` and `supabase_access_token`,
   so `third_party_secrets` (required, no default: Paystack, Resend, Anthropic,
   Browserless, exchange-rate) is coming from `TF_VAR_third_party_secrets` in the
   operator's shell. **Whichever way those are supplied, supply the optional ones
   the same way** — an env var beats a tfvars entry and a split will silently drop
   one of them.

2. State is HCP Terraform with an empty `cloud {}` block, so it is configured
   entirely from the environment (`infra/backend.tf` documents this):

   ```bash
   cd infra
   export TF_CLOUD_ORGANIZATION=<org> TF_CLOUD_PROJECT=tomame
   export TF_WORKSPACE=tomame-dev          # tomame-prod for production
   terraform init
   terraform plan  -var-file=envs/dev.tfvars
   terraform apply -var-file=envs/dev.tfvars
   ```

   `~/.terraform.d/credentials.tfrc.json` exists, so the HCP token is already
   there; only the three `TF_CLOUD_*`/`TF_WORKSPACE` vars are unset.

3. **Read the plan before applying.** The apply covers the whole config — Vercel
   projects, Supabase settings, the Resend domain — not just these three
   variables. Anything in the plan beyond the three new env vars is drift worth
   understanding before it is applied, especially on `tomame-prod`.

4. Repeat for `TF_WORKSPACE=tomame-prod` with `envs/prod.tfvars`.

Without these keys the Oxylabs and Zyte tiers are simply skipped — the extractor
still works via ScraperAPI and the HTML tiers, just slower and across fewer
stores. So this is not release-blocking, but it is most of what the speed work
bought.

---

## 5. `policies` is empty on both projects

`supabase/seeds/policies.sql` has never been applied, so `policies` has 0 rows on
dev and prod. Two consequences:

- The marketing footer's Legal column and `/policies` render empty.
- **The new quote screen's assurance cards link to `/policies#payment` and
  `/policies#returns`** — live links to nothing. Migration 047 seeded the card
  copy, but the policies they point at do not exist.

Apply the seed to both projects after §3. It is a seed, not a migration, so it
does not belong in `schema_migrations`.

---

## 6. After the databases are current

- `npm run build` reads the **hosted** project (`.env.local`), and has been
  failing on the marketing tables by design. Once §3 is done on the project
  `.env.local` points at, the build should pass — run it as the real check that
  the push worked.
- Deploy `v2` for the redesign; `main` is the current design and keeps every
  scraper improvement. Reverting the redesign = deploying `main`.
- The two DB-settings one-liners in older docs
  (`alter database postgres set app.settings.*`) are **obsolete and cannot work**
  on hosted — they answer 42501. `app_url` and `cron_secret` live in
  `supabase_vault` and are already set on both projects. Commit `bf1adf6` fixed
  042 and 045 to read the vault; do not reintroduce a GUC-only read.

---

## 7. State of the code as of this runbook

Branch `v2` (redesign) branches off `main` (current design + shared scraping).
Both green: typecheck clean, lint exactly 9 pre-existing errors, `main`
26 files/279 tests, `v2` 62 files/838 tests. Phase 3 is complete and closed —
see `docs/phase-3-handoff.md` §9. Nothing is pushed to a remote yet.
