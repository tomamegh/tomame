# ===========================================================================
# Tomame — full provision, from nothing.
#
# Order of dependence, which is also the order to read this file:
#
#   random ──► supabase ──┐
#                         ├──► locals.app_env ──┬──► vercel (build-time copy)
#   resend ───────────────┘                     └──► outputs (operator credentials)
#
# Everything the app needs at runtime is derived here rather than typed
# anywhere: the only values a human supplies are credentials for vendors that
# have no API to mint them (var.third_party_secrets) and the tokens Terraform
# authenticates with.
# ===========================================================================

locals {
  # tomame-dev, tomame-prod. One scheme, used for the Vercel project, the
  # Supabase project and the Resend key name, so a resource found in any one
  # dashboard names the environment it belongs to.
  name_prefix = "${var.product}-${var.environment}"

  has_domain = var.root_domain != null

  # The environment-specific hostname. dev gets a subdomain so one registered
  # domain serves both environments without a second purchase.
  app_host = local.has_domain ? (
    var.environment == "prod" ? var.root_domain : "${var.environment}.${var.root_domain}"
  ) : null

  # Canonical origin. Falls back to the Vercel production URL when no domain is
  # configured, so NEXT_PUBLIC_APP_URL is always a real, reachable origin —
  # Paystack callbacks and Supabase auth links are both built from it, and
  # neither tolerates a placeholder.
  #
  # The fallback is spelled out from name_prefix rather than read from
  # module.vercel.default_url, which would be a cycle: the Vercel module consumes
  # app_env, and app_env contains this value. Vercel derives that hostname from
  # the project name, which is name_prefix, so the two agree by construction.
  vercel_default_url = "https://${local.name_prefix}.vercel.app"

  app_url = local.has_domain ? "https://${local.app_host}" : local.vercel_default_url

  # An empty mail_subdomain means send from the apex — the configuration
  # thor-v2's platform_infra has been running against trythorai.com, where the
  # registered Resend domain and the DNS zone are the same name and no record
  # renaming is needed at all. Guard the join, or "" produces ".tomame.gh".
  sending_domain = (
    !local.has_domain ? null :
    var.mail_subdomain == "" ? var.root_domain :
    "${var.mail_subdomain}.${var.root_domain}"
  )

  # Resend's shared domain until a verified one exists. It sends, it is rate
  # limited, and it is visibly not the brand — which is the correct amount of
  # pressure to get a real domain configured.
  mail_from = local.has_domain ? "Tomame <no-reply@${local.sending_domain}>" : "Tomame <onboarding@resend.dev>"

  # -------------------------------------------------------------------------
  # The application environment.
  #
  # Keys here must match src/lib/env.ts exactly. That file throws on a missing
  # value at module load, so a typo is a boot failure on every route, not a
  # degraded feature.
  # -------------------------------------------------------------------------
  provisioned_env = {
    NEXT_PUBLIC_SUPABASE_URL             = module.supabase.api_url
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = module.supabase.publishable_key
    SUPABASE_SECRET_KEY                  = module.supabase.service_role_key
    NEXT_PUBLIC_APP_URL                  = local.app_url
    RESEND_API_KEY                       = local.has_domain ? module.resend[0].api_key : ""
    RESEND_FROM_EMAIL                    = local.mail_from
    CRON_SECRET                          = random_password.cron_secret.result

    # Set explicitly even though the code has a fallback. A value that only
    # exists as a default in application code is invisible to anyone reading the
    # environment, and TAX_PERCENTAGE in particular decides what a customer pays.
    TAX_PERCENTAGE      = tostring(var.tax_percentage)
    BROWSERLESS_API_URL = var.browserless_api_url
  }

  # What the RUNNING APP needs. This is what Vercel gets, and nothing more.
  #
  # The database password is deliberately absent. The app has no Postgres driver
  # and never reads a connection string — it reaches Supabase over HTTPS through
  # supabase-js, authenticating with the keys above. Putting the password in
  # Vercel would place a credential in the build environment that no code path
  # there can use, which is pure blast radius: every preview deployment and
  # anyone with project access would hold direct superuser access to production
  # data, for nothing.
  app_env = merge(
    local.provisioned_env,
    var.third_party_secrets,
    var.optional_third_party_secrets,
  )

  # Postgres URI for migrations and psql. Not part of app_env — it is an
  # operator credential, surfaced through the database_url output rather than
  # deployed anywhere.
  #
  # The password is percent-encoded because it is generated with characters that
  # are legal in a password and meaningful in a URI — without this, a password
  # containing "#" silently truncates the connection string at that character.
  database_url = format(
    "postgresql://postgres:%s@%s:5432/postgres?sslmode=require",
    urlencode(random_password.supabase_db.result),
    module.supabase.database_host,
  )

  # -------------------------------------------------------------------------
  # Resend's records, normalized for a Vercel-hosted zone.
  #
  # Resend reports each record's name against the domain it was registered for
  # (send.<root_domain>), while Vercel wants it relative to the ZONE
  # (<root_domain>). Those differ by exactly the mail subdomain, and getting it
  # wrong publishes resend._domainkey.tomame.gh where
  # resend._domainkey.send.tomame.gh was needed — a record that resolves fine
  # and verifies nothing.
  #
  # Both spellings are handled because Resend is not consistent about returning
  # fully-qualified names: strip the zone suffix if present, otherwise treat the
  # name as relative to the sending domain and append the subdomain.
  #
  # ⚠️ Assumption to check on the first apply, against the resend_dns_records
  # output — see README.
  # -------------------------------------------------------------------------
  resend_records_raw = local.has_domain ? module.resend[0].dns_records : []

  resend_records_for_vercel = [
    for record in local.resend_records_raw : {
      name = (
        # Sending from the apex: registered domain and zone are the same name,
        # so Resend's name is already zone-relative. This is the path
        # platform_infra/modules/dns has been running in production, where the
        # record name is used verbatim.
        var.mail_subdomain == "" ? try(record.name, "") :
        # Already fully qualified within the zone: "x.send.tomame.gh" -> "x.send"
        endswith(try(record.name, ""), ".${var.root_domain}") ?
        trimsuffix(record.name, ".${var.root_domain}") :
        # The sending domain itself -> the subdomain
        try(record.name, "") == local.sending_domain || try(record.name, "") == "" ?
        var.mail_subdomain :
        # Relative to the sending domain: "resend._domainkey" -> "resend._domainkey.send"
        "${record.name}.${var.mail_subdomain}"
      )
      type  = try(record.type, "TXT")
      value = try(record.value, "")

      # Resend reports ttl as a string, sometimes "Auto". tonumber fails on that,
      # so fall back — the same coercion platform_infra/modules/dns uses.
      ttl      = try(tonumber(record.ttl), null)
      priority = try(tonumber(record.priority), null)
    }
  ]

  # Only NEXT_PUBLIC_* reaches the browser. Everything else is server-side and
  # is written to Vercel as sensitive, so it cannot be read back out of the
  # dashboard by anyone who gains view access to the project.
  # Secrets do not target `development`. Vercel rejects a sensitive variable on
  # that target outright — `vercel env pull` writes development variables into a
  # local .env file, so they have to stay readable, and a sensitive one could
  # not be. The rule is the platform enforcing what we would want anyway: a
  # service-role key has no business being pulled onto a laptop by a command
  # whose job is convenience.
  #
  # Local development reads .env instead, which is what src/lib/env.ts already
  # expects.
  vercel_env = {
    for key, value in local.app_env :
    key => {
      value     = value
      sensitive = !startswith(key, "NEXT_PUBLIC_")
      targets   = startswith(key, "NEXT_PUBLIC_") ? ["production", "preview", "development"] : ["production", "preview"]
    }
  }
}

# ---------------------------------------------------------------------------
# Generated credentials.
#
# Two secrets nobody needs to choose, so nobody should: a human-chosen value
# here is either weak or written down somewhere it should not be.
# ---------------------------------------------------------------------------

resource "random_password" "supabase_db" {
  length  = 40
  special = true
  # Supabase puts this password into a Postgres connection URI. These four are
  # the characters that need percent-encoding there, and a password containing
  # one produces a connection string that fails to parse in some clients but not
  # others — a failure that looks like a network problem for a day.
  override_special = "!#%*()-_=+[]{}<>:?"
}

resource "random_password" "cron_secret" {
  length  = 48
  special = false # Compared as a bearer token in an Authorization header.
}

# ---------------------------------------------------------------------------
# Supabase — Postgres, Auth, and the app's API keys.
# ---------------------------------------------------------------------------

module "supabase" {
  source = "./modules/supabase-project"

  name              = local.name_prefix
  organization_id   = var.supabase_organization_id
  region            = var.supabase_region
  database_password = random_password.supabase_db.result
  instance_size     = var.supabase_instance_size

  site_url = local.app_url

  # Vercel gives every preview deployment a distinct hostname, so auth callbacks
  # on previews cannot be enumerated ahead of time.
  additional_redirect_urls = concat(
    [
      "${local.app_url}/**",
      "${local.app_url}/auth/callback",
      "${local.app_url}/auth/confirm",
    ],
    var.environment == "prod" ? [] : [
      "http://localhost:3000/**",
      "https://${local.name_prefix}-*.vercel.app/**",
    ],
  )

  enable_signup = true
  max_rows      = 1000
}

# ---------------------------------------------------------------------------
# Resend — sending domain and the app's sending key.
#
# Skipped entirely without a domain: Resend can only verify a domain whose DNS
# you control, and creating an unverifiable one leaves a permanently pending
# resource that every future plan reports as changed.
# ---------------------------------------------------------------------------

module "resend" {
  source = "./modules/resend-domain"
  count  = local.has_domain ? 1 : 0

  sending_domain     = local.sending_domain
  region             = var.resend_region
  api_key_name       = "${local.name_prefix}-app"
  api_key_permission = "sending_access"
}

# ---------------------------------------------------------------------------
# Vercel — the project, its domains, and the build-time copy of the environment.
# ---------------------------------------------------------------------------

module "vercel" {
  source = "./modules/vercel-app"

  name              = local.name_prefix
  github_repo       = var.github_repo
  production_branch = var.production_branch

  # Match the Supabase region: every request makes several Postgres round trips
  # and a cross-continent hop is paid on each one.
  function_regions = var.supabase_region == "eu-west-2" ? ["lhr1"] : ["iad1"]

  # The apex serves production; every other environment gets its own subdomain.
  custom_domains = local.has_domain ? (
    var.environment == "prod" ? [var.root_domain, "www.${var.root_domain}"] : [local.app_host]
  ) : []

  environment_variables = local.vercel_env

  # Previews render real orders against the environment's database.
  vercel_authentication_deployment_type = "standard_protection"
}

# ---------------------------------------------------------------------------
# Resend's DNS records, published into the Vercel-hosted zone.
#
# This is what closes the loop: with the zone on Vercel, the sending domain
# verifies on the same apply that created it, instead of waiting on somebody to
# paste four records into a registrar. Without it, resend_dns_records is an
# output and a customer's order confirmation does not send until that happens.
# ---------------------------------------------------------------------------

module "resend_dns" {
  source = "./modules/vercel-dns-records"
  count  = local.has_domain && var.dns_managed_by_vercel ? 1 : 0

  zone    = var.root_domain
  records = local.resend_records_for_vercel
}

# Verification, ordered after the records exist.
#
# depends_on is what makes the single-apply path work. Without it Terraform is
# free to verify and publish concurrently — both only depend on the domain — and
# the verification loses that race every time.
#
# When the zone is elsewhere, this still runs and still reports not_started;
# that is correct and harmless. Publish the records, re-apply, and the second
# run verifies.
module "resend_verify" {
  source = "./modules/resend-verify"
  count  = local.has_domain ? 1 : 0

  domain_id = module.resend[0].domain_id

  depends_on = [module.resend_dns]
}

# ---------------------------------------------------------------------------
# There is no secret store in this stack.
#
# Vercel holds what the running app needs, and Terraform state holds everything
# else — the database password, the connection URI, the Resend key. Operator
# credentials are read one at a time through `terraform output -raw <name>`.
#
# Two consequences worth being deliberate about:
#
#   1. Read access to state IS access to every credential here. There is no
#      narrower grant, so state access is the privilege boundary. backend.tf is
#      where that is enforced.
#   2. Rotating a key in a vendor dashboard leaves Terraform's copy stale, and
#      the next apply pushes the old value back into Vercel. Rotate by changing
#      it here and applying, not the other way round.
# ---------------------------------------------------------------------------
