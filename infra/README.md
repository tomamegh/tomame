# Tomame infrastructure

Terraform for everything Tomame runs on: the Vercel project that serves it, the
Supabase project that stores it, and the Resend domain it mails from.

Nothing is provisioned today. This directory provisions it from zero.

```
infra/
├── main.tf              composition — how the modules wire together
├── variables.tf         inputs, with the validation that catches a bad one at plan
├── outputs.tf           URLs, ids, credentials, and the post-apply SQL
├── providers.tf         provider configuration
├── versions.tf          pinned provider versions
├── backend.tf           HCP Terraform backend (state only)
├── envs/
│   ├── dev.tfvars
│   └── prod.tfvars
└── modules/
    ├── supabase-project/     Postgres, Auth settings, API keys
    ├── resend-domain/        sending domain + the app's sending key
    ├── resend-verify/        asks Resend to check DNS, ordered after publishing
    ├── vercel-dns-records/   publishes records into a Vercel-hosted zone
    └── vercel-app/           project, domains, environment variables
```

---

## What Terraform owns, and what it does not

| Owned here | Owned elsewhere |
|---|---|
| Supabase project, region, compute, auth settings | The **schema** — `supabase/migrations/*.sql` |
| Vercel project, domains, env vars, deploy protection | The **build** — `package.json`, `next.config.ts` |
| Resend sending domain and the app's API key | The **DNS delegation** — pointing NS at Vercel |
| DNS records, *if* `dns_managed_by_vercel` | The zone itself, when it lives elsewhere |
| Generated secrets (DB password, `CRON_SECRET`) | Vendor keys — Paystack, Apify, SerpAPI, Browserless |

The schema split is deliberate. `terraform destroy` must never be able to drop a
table: it can destroy the whole project, which is loud, but it cannot quietly
remove a column because a resource block moved.

---

## Before the first apply

**1. A domain you control.**

`tomame.com` is not usable. Its nameservers are `ns3/ns4.afternic.com` — GoDaddy's
domain marketplace — it is registered since 2005 with `clientTransferProhibited`,
resolves to AWS parking IPs, and publishes `v=spf1 -all` with a null `MX 0 .`,
the standard signature of a domain that sends no mail. Resend cannot verify it
and Vercel cannot attach it.

Both `envs/*.tfvars` therefore ship with `root_domain = null`, which is a fully
working configuration: the app serves on `https://tomame-<env>.vercel.app` and
mail goes out over Resend's shared `onboarding@resend.dev`. Set a real domain
when you have one and re-apply; every URL downstream is derived, so nothing else
changes.

**2. Somewhere to keep state.** State holds the database password, the Supabase
service-role key and the Resend API key in cleartext, so it needs encryption,
versioning and locking. `backend.tf` uses HCP Terraform's free tier, which gives
all three with nothing to bootstrap.

The `tomame-dev` and `tomame-prod` workspaces already exist in the `tommame`
organization, both created with **Local** execution mode — matching every
workspace in `project-tor`. A workspace created through the UI instead defaults
to *remote*
execution, which runs on HCP's runners where none of your `TF_VAR_*` exist — the
apply then fails on a missing variable, and the obvious-looking fix is to copy
every secret into the HCP workspace, which is a second place for them to go
stale. Local execution keeps runs here and uses HCP purely as the state store.

S3 works too, but on Terraform 1.9 it needs a DynamoDB table for locking
(`use_lockfile` landed in 1.10) — two AWS resources to create before this
directory runs at all. That also rules out R2 and B2: both speak the S3 API and
both are free, but neither has DynamoDB, so on 1.9 they would run with **no
state locking**, and two concurrent applies would drop the loser's resources
from state while leaving them alive upstream.

**3. Credentials.** Everything sensitive arrives as `TF_VAR_*`, from your shell
or a `*.auto.tfvars` file that `.gitignore` already excludes. Nothing sensitive
is ever written into `envs/*.tfvars`, which are committed.

| Variable | What it is |
|---|---|
| `TF_VAR_vercel_api_token` | Vercel API token |
| `TF_VAR_supabase_access_token` | Supabase PAT (`sbp_…`) |
| `TF_VAR_supabase_organization_id` | Supabase org being billed |
| `TF_VAR_resend_api_token` | Resend **full-access** key, used only by Terraform |
| `TF_VAR_third_party_secrets` | JSON map of the seven vendor keys |

The Resend token here is not the one the app uses. Terraform uses a full-access
key to create the domain and mint the app a separate `sending_access` key that
can do nothing but send.

---

## Applying

```bash
cd infra

export TF_CLOUD_ORGANIZATION=tommame
export TF_WORKSPACE=tomame-dev          # tomame-prod for production

terraform init
terraform plan -var-file=envs/dev.tfvars -out=tfplan
terraform apply tfplan
```

Switch environments with a different `TF_WORKSPACE` and `terraform init -reconfigure`.

Run the module tests any time — they mock the providers, so they need no
credentials and no backend:

```bash
terraform test
```

### After the apply — three steps Terraform cannot do

**1. Apply the schema.** Terraform created an empty database.

```bash
terraform output -raw supabase_project_ref   # the project to target
psql "$(terraform output -raw database_url)" -f supabase/migrations/001_....sql
# ...in order
```

**2. Set the database settings the cron job reads. Do not skip this.**

```bash
terraform output -raw post_apply_sql | psql "$(terraform output -raw database_url)"
```

`refresh_exchange_rates()` in migration 026 reads `app.settings.app_url` and
`app.settings.cron_secret` with `current_setting(..., true)`. When they are
unset it raises a warning and returns. The cron keeps firing every four hours
and keeps doing nothing — no failed request, no error, nothing to alert on.
Exchange rates go stale, and `pricing_config.exchange_rate` is what converts
every order to GHS. The failure mode is silent mispricing, which is why this
step has its own output rather than a line in a runbook.

**3. Publish the Resend DNS records** — only if `dns_managed_by_vercel = false`.

```bash
terraform output -json resend_dns_records
```

Then re-apply so verification runs again. Until those records resolve, Resend
rejects every send and customers get no order confirmation.

**With `dns_managed_by_vercel = true` this step does not exist.** Terraform
publishes the records into the Vercel zone and verifies afterwards, in one
apply. Check what it created with:

```bash
terraform output -json resend_dns_published
```

---

## Design notes

**Why environment variables are separate resources.** `vercel_project` accepts an
inline `environment` set, but a set is replaced wholesale on any change — adding
one variable briefly removes the rest, and a deployment landing in that window
builds without them. One resource per variable also makes the plan legible.

**Why `nonsensitive()` appears on `for_each`.** Terraform refuses a sensitive
`for_each` because instance keys become part of the resource address, visible in
plans, state and errors. The restriction is about keys, and these keys are
variable names already public in `src/lib/env.ts`. Only the names are unwrapped;
every value stays marked.

**Why `NEXT_PUBLIC_*` may not be sensitive.** Next.js inlines those into the
client bundle at build time. Marking one sensitive hides it from the Vercel
dashboard while still shipping it to every visitor — the worst of both. The
`vercel-app` module rejects it, and rejects the inverse too.

**Sending from a subdomain, and the alternative.** `mail_subdomain` defaults to
`send`, giving `send.<root_domain>`, which keeps transactional mail's SPF and
DMARC reputation separate from the apex. The cost is that Resend reports record
names against the domain it registered while Vercel wants them relative to the
*zone*, so the names need rewriting — `local.resend_records_for_vercel`.

Set `mail_subdomain = ""` to send from the apex instead. Registered domain and
zone are then the same name, Resend's names are used verbatim, and the rewriting
disappears. That is the configuration `thor-v2/platform_infra` has been running
against `trythorai.com`, so it is the proven one; the subdomain default is the
better practice. Both are supported and tested.

**Letting Vercel host the zone.** Set `dns_managed_by_vercel = true` and
Terraform writes Resend's DKIM/SPF/DMARC records straight into the zone, so the
sending domain verifies on the same apply that created it rather than waiting on
somebody to paste four records into a registrar.

This does *not* delegate the domain. The Vercel provider has `vercel_dns_record`
and `vercel_project_domain` and nothing that registers a domain or takes over a
zone, so adding the domain to the account and pointing its nameservers at Vercel
stays a one-time manual step. Setting the flag before that creates records in a
zone nobody queries.

Two details this required:

- **Verification had to move out of `resend-domain`.** Inside that module it
  could only run at creation time, before any record existed, so it always
  reported `not_started`. It is now `resend-verify`, with a `depends_on` — which
  is what makes the one-apply path work, since otherwise Terraform is free to
  verify and publish concurrently and verification loses that race every time.
- **Names are normalized.** Resend reports each record against the domain it was
  registered for (`send.<root>`), Vercel wants it relative to the *zone*
  (`<root>`). Those differ by the mail subdomain, and getting it wrong publishes
  `resend._domainkey.tomame.gh` where `resend._domainkey.send.tomame.gh` was
  needed — a record that resolves fine and verifies nothing. Both spellings are
  handled and converge to the same name; see `local.resend_records_for_vercel`.

**Why Resend looks different.** There is no Resend Terraform provider —
`resend/resend`, `resendlabs/resend`, `drfaust92/resend` and
`adaptive-scale/resend` were all probed against the registry and none exist. That
module drives Resend's REST API through `magodo/restful`. A first-party provider
validates its own API shape; a generic client cannot, so a wrong field name there
fails at **apply**, not at plan. Run it against a throwaway Resend account first.

**Where credentials end up.** Vercel holds exactly what the running app reads —
16 variables. The database password and connection URI are **not** among them:
the app has no Postgres driver and never opens a connection, so deploying them
would put superuser access into every preview build for no purpose. They live in
Terraform state and are read out one at a time:

```bash
terraform output -raw database_url
terraform output -raw supabase_service_role_key
```

With no secret store in this stack, read access to state *is* access to every
credential — that is the privilege boundary, and `backend.tf` is where it is
enforced. It also means rotation has a direction: change a key here and apply.
Rotating in a vendor dashboard leaves Terraform's copy stale, and the next apply
pushes the old value back into Vercel.

**Why no Vercel cron.** The exchange-rate job is scheduled by `pg_cron` inside
Supabase (migration 026). A Vercel cron on the same route would double-run it.

---

## Verification performed

- Provider versions resolved against the live registry: `vercel/vercel` 5.14.0,
  `supabase/supabase` 1.10.1, `magodo/restful` 0.25.2.
  Every resource attribute in this directory was taken from
  `terraform providers schema -json`, not from memory.
- `terraform fmt -recursive -check` — clean.
- `terraform validate` — passes.
- `terraform graph` — builds, no cycles.
- `terraform plan` with throwaway credentials reaches provider authentication,
  which is as far as it can go without real ones. The `random` and `supabase`
  resources plan correctly; the Resend module plans correctly when
  `root_domain` is set.
- Derived values checked in all four combinations:

  | env | domain | `app_url` | `RESEND_FROM_EMAIL` |
  |---|---|---|---|
  | dev | none | `https://tomame-dev.vercel.app` | `onboarding@resend.dev` |
  | dev | set | `https://dev.tomame.gh` | `no-reply@send.tomame.gh` |
  | prod | none | `https://tomame-prod.vercel.app` | `onboarding@resend.dev` |
  | prod | set | `https://tomame.gh` | `no-reply@send.tomame.gh` |

- Variable validation confirmed to reject a missing vendor key and an empty value.

**Not verified:** no `apply` has run. Resend's request and response field names
are asserted from its public API, and the Supabase settings JSON is forwarded
verbatim to the Management API, which the provider does not validate. Both fail
at apply rather than plan if a name is wrong.
