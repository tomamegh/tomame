# random + supabase + resend ──► app_env ──► vercel, with operator credentials
# left in outputs. See README.md for the why.

locals {
  # Names the Vercel project, the Supabase project and the Resend key.
  name_prefix = "${var.product}-${var.environment}"

  has_domain = var.root_domain != null

  # dev gets a subdomain so one domain serves both environments.
  app_host = local.has_domain ? (
    var.environment == "prod" ? var.root_domain : "${var.environment}.${var.root_domain}"
  ) : null

  # Spelled out rather than read from module.vercel.default_url, which would be
  # a cycle — the Vercel module consumes app_env, and app_env contains this.
  vercel_default_url = "https://${local.name_prefix}.vercel.app"

  app_url = local.has_domain ? "https://${local.app_host}" : local.vercel_default_url

  # An empty mail_subdomain sends from the apex; guard the join or "" produces
  # ".tomame.ca".
  sending_domain = (
    !local.has_domain ? null :
    var.mail_subdomain == "" ? var.root_domain :
    "${var.mail_subdomain}.${var.root_domain}"
  )

  # Resend's shared domain until a verified one exists.
  mail_from = local.has_domain ? "Tomame <no-reply@${local.sending_domain}>" : "Tomame <onboarding@resend.dev>"

  # Keys must match src/lib/env.ts exactly; it throws at module load on a
  # missing one, so a typo is a boot failure on every route.
  provisioned_env = {
    NEXT_PUBLIC_SUPABASE_URL             = module.supabase.api_url
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = module.supabase.publishable_key
    SUPABASE_SECRET_KEY                  = module.supabase.service_role_key
    NEXT_PUBLIC_APP_URL                  = local.app_url
    RESEND_API_KEY                       = local.has_domain ? module.resend[0].api_key : ""
    RESEND_FROM_EMAIL                    = local.mail_from
    CRON_SECRET                          = random_password.cron_secret.result

    # Set explicitly despite code defaults: TAX_PERCENTAGE decides what a
    # customer pays, and a default in code is invisible from the environment.
    TAX_PERCENTAGE      = tostring(var.tax_percentage)
    BROWSERLESS_API_URL = var.browserless_api_url
  }

  # What Vercel gets, and nothing more. The database password is absent: the app
  # has no Postgres driver, so deploying it would add blast radius for nothing.
  app_env = merge(
    local.provisioned_env,
    var.third_party_secrets,
    var.optional_third_party_secrets,
  )

  # Operator credential, surfaced as an output rather than deployed. The
  # password is percent-encoded or a "#" truncates the connection string.
  database_url = format(
    "postgresql://postgres:%s@%s:5432/postgres?sslmode=require",
    urlencode(random_password.supabase_db.result),
    module.supabase.database_host,
  )

  # Resend names records against the registered domain; Vercel wants them zone
  # relative. Identical when mail_subdomain is "".
  resend_records_raw = local.has_domain ? module.resend[0].dns_records : []

  resend_records_for_vercel = [
    for record in local.resend_records_raw : {
      name = (
        var.mail_subdomain == "" ? try(record.name, "") :
        endswith(try(record.name, ""), ".${var.root_domain}") ?
        trimsuffix(record.name, ".${var.root_domain}") :
        try(record.name, "") == local.sending_domain || try(record.name, "") == "" ?
        var.mail_subdomain :
        "${record.name}.${var.mail_subdomain}"
      )
      type  = try(record.type, "TXT")
      value = try(record.value, "")

      # Resend reports ttl as a string, sometimes "Auto".
      ttl      = try(tonumber(record.ttl), null)
      priority = try(tonumber(record.priority), null)
    }
  ]

  # Only NEXT_PUBLIC_* reaches the browser. Everything else is server-side and
  # is written to Vercel as sensitive, so it cannot be read back out of the
  # dashboard by anyone who gains view access to the project.
  # Secrets skip `development`: Vercel rejects a sensitive variable there,
  # because `vercel env pull` writes that target into a local .env file.
  vercel_env = {
    for key, value in local.app_env :
    key => {
      value     = value
      sensitive = !startswith(key, "NEXT_PUBLIC_")
      targets   = startswith(key, "NEXT_PUBLIC_") ? ["production", "preview", "development"] : ["production", "preview"]
    }
  }
}

# Two secrets nobody needs to choose, so nobody should.

resource "random_password" "supabase_db" {
  length  = 40
  special = true

  # Excludes the characters that need percent-encoding in a Postgres URI.
  override_special = "!#%*()-_=+[]{}<>:?"
}

resource "random_password" "cron_secret" {
  length  = 48
  special = false # Compared as a bearer token in an Authorization header.
}

module "supabase" {
  source = "./modules/supabase-project"

  name              = local.name_prefix
  organization_id   = var.supabase_organization_id
  region            = var.supabase_region
  database_password = random_password.supabase_db.result
  instance_size     = var.supabase_instance_size

  site_url = local.app_url

  # Preview deployments each get a distinct hostname, hence the wildcard.
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

# Skipped without a domain: an unverifiable domain stays pending forever and
# every future plan reports it as changed.

module "resend" {
  source = "./modules/resend-domain"
  count  = local.has_domain ? 1 : 0

  sending_domain     = local.sending_domain
  region             = var.resend_region
  api_key_name       = "${local.name_prefix}-app"
  api_key_permission = "sending_access"
}

module "vercel" {
  source = "./modules/vercel-app"

  name              = local.name_prefix
  github_repo       = var.github_repo
  production_branch = var.production_branch

  # Match the Supabase region; every request makes several Postgres round trips.
  function_regions = var.supabase_region == "eu-west-2" ? ["lhr1"] : ["iad1"]

  # The apex serves production; other environments get a subdomain.
  custom_domains = local.has_domain ? (
    var.environment == "prod" ? [var.root_domain, "www.${var.root_domain}"] : [local.app_host]
  ) : []

  environment_variables = local.vercel_env

  # Previews render real orders against the environment's database.
  vercel_authentication_deployment_type = "standard_protection"
}

# With the zone on Vercel the sending domain verifies without anyone pasting
# records into a registrar. Otherwise they come out as an output.

module "resend_dns" {
  source = "./modules/vercel-dns-records"
  count  = local.has_domain && var.dns_managed_by_vercel ? 1 : 0

  zone    = var.root_domain
  records = local.resend_records_for_vercel
}

# depends_on is what orders this after publishing; without it Terraform may
# verify and publish concurrently, and verification loses that race.
module "resend_verify" {
  source = "./modules/resend-verify"
  count  = local.has_domain ? 1 : 0

  domain_id = module.resend[0].domain_id

  depends_on = [module.resend_dns]
}

# No secret store here: state holds every operator credential, so read access to
# state is the privilege boundary, and rotation goes through Terraform — a key
# rotated in a vendor dashboard is pushed back to the old value on next apply.
