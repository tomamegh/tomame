output "app_url" {
  description = "Canonical origin of the deployed app."
  value       = local.app_url
}

output "supabase_project_ref" {
  description = <<-EOT
    Supabase project reference. Needed to apply the SQL in supabase/migrations —
    Terraform provisions the project, the migration tooling owns the schema.
  EOT
  value       = module.supabase.project_ref
}

output "supabase_database_host" {
  description = "Postgres host for migrations and psql."
  value       = module.supabase.database_host
}

output "vercel_project_id" {
  description = "Vercel project id, the value `vercel link` writes to .vercel/project.json."
  value       = module.vercel.project_id
}

output "vercel_domain_status" {
  description = "Attached custom domains and whether Vercel still considers each misconfigured."
  value       = module.vercel.domains
}

output "resend_dns_records" {
  description = <<-EOT
    DNS records that must be published before Resend will accept a send. Empty
    when no domain is configured.

    When dns_managed_by_vercel is true these are published automatically and
    this output is only for cross-checking against `dig`. When it is false, the
    zone is not managed by this stack: publish these by hand, then re-apply so
    verification runs again.
  EOT
  value       = local.has_domain ? module.resend[0].dns_records : []
}

output "resend_dns_published" {
  description = <<-EOT
    Records this stack actually created in the Vercel zone, as name and type.
    Empty when dns_managed_by_vercel is false.

    Compare against resend_dns_records when a domain will not verify — it
    separates "Terraform never created the record" from "the record exists but
    carries the wrong value", which are different problems with different fixes.
  EOT
  value       = length(module.resend_dns) > 0 ? module.resend_dns[0].published : []
}

output "resend_domain_status" {
  description = "not_started | pending | verified | failed. Expect not_started on a first apply."
  value       = local.has_domain ? module.resend[0].domain_status : "no domain configured"
}

output "managed_env_keys" {
  description = <<-EOT
    Every environment variable this stack sets, by name. Cross-check against
    src/lib/env.ts after changing either: a name present in one and not the
    other is a boot failure on every route, and it will not show up in a plan.
  EOT
  # The names come from a sensitive map, so Terraform marks them sensitive by
  # association and would otherwise refuse to output them. Names are not secret
  # — they are literals in src/lib/env.ts — and the whole point of this output is
  # to be readable next to that file. Only the keys are unwrapped; no value is.
  value = nonsensitive(sort(keys(local.app_env)))
}

# ---------------------------------------------------------------------------
# Credentials, for bootstrapping a local .env. Read one at a time:
#
#     terraform output -raw supabase_service_role_key
#
# Read one at a time. Nothing here should be pasted into a file that is not
# already gitignored.
# ---------------------------------------------------------------------------

output "supabase_publishable_key" {
  description = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
  value       = module.supabase.publishable_key
  sensitive   = true
}

output "supabase_service_role_key" {
  description = "SUPABASE_SECRET_KEY. Server-side only — it bypasses RLS."
  value       = module.supabase.service_role_key
  sensitive   = true
}

output "supabase_database_password" {
  description = <<-EOT
    Postgres superuser password. Deliberately NOT given to Vercel: the app has
    no Postgres driver and never opens a connection, so deploying it there would
    put superuser access in every preview build for no purpose.
  EOT
  value       = random_password.supabase_db.result
  sensitive   = true
}

output "database_url" {
  description = <<-EOT
    Postgres connection URI for migrations and psql, password percent-encoded.

        terraform output -raw database_url

    Pipe it rather than storing it:

        terraform output -raw database_url | xargs -0 psql

    It is not deployed anywhere — an operator credential, not app config.
  EOT
  value       = local.database_url
  sensitive   = true
}

output "cron_secret" {
  description = "CRON_SECRET, the bearer token /api/cron/exchange-rates checks."
  value       = random_password.cron_secret.result
  sensitive   = true
}

output "resend_api_key" {
  description = "RESEND_API_KEY. Resend returns this once, at creation; there is no way to read it back."
  value       = local.has_domain ? module.resend[0].api_key : null
  sensitive   = true
}

output "post_apply_sql" {
  description = <<-EOT
    Run this against the provisioned database after applying migrations:

        terraform output -raw post_apply_sql | psql "$DATABASE_URL"

    supabase/migrations/026_exchange_rates_pg_cron.sql schedules the exchange
    rate refresh with pg_cron, and the function reads the app URL and the cron
    secret out of database settings that no migration can contain — the values
    do not exist until this stack has created the project.

    This is not cosmetic. refresh_exchange_rates() reads both with
    current_setting(..., true), and when they are unset it raises a warning and
    RETURNS. The cron job keeps firing on schedule and keeps doing nothing, with
    no failed request anywhere to notice. Exchange rates then go stale, and
    pricing is computed against a stale rate — every order is mispriced, quietly.

    Terraform cannot issue these itself without a Postgres connection from
    wherever it runs, which would mean a fifth provider and an IP allowlist. One
    piped command is the smaller cost.
  EOT
  sensitive   = true
  value       = <<-SQL
    -- Generated by terraform. Values come from this stack; do not edit by hand.
    alter database postgres set app.settings.app_url = '${local.app_url}';
    alter database postgres set app.settings.cron_secret = '${random_password.cron_secret.result}';
  SQL
}
