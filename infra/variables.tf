# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------

variable "environment" {
  description = <<-EOT
    Which deployment this is. Every name derived below carries it, so two
    environments can share one Vercel team and one Supabase org without
    colliding: "tomame-dev" and "tomame-prod".
  EOT
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be \"dev\" or \"prod\"."
  }
}

variable "product" {
  description = "Product slug, the prefix on every provisioned name."
  type        = string
  default     = "tomame"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.product))
    error_message = "product must be lowercase kebab-case, 2-21 characters."
  }
}

# ---------------------------------------------------------------------------
# Domain
# ---------------------------------------------------------------------------

variable "root_domain" {
  description = <<-EOT
    Apex domain the app is served from and sends mail from, e.g. "tomame.gh".
    Leave null to provision without one: the app is reachable on its Vercel
    production URL and mail goes out over Resend's shared sending domain.

    ⚠️ tomame.com is NOT usable. It is parked at Afternic (ns3/ns4.afternic.com),
    registered since 2005 with clientTransferProhibited, and publishes
    `v=spf1 -all` with a null `MX 0 .` — a domain advertising that it sends no
    mail. Resend cannot verify it and Vercel cannot attach it. Set this only to
    a domain whose nameservers you control.
  EOT
  type        = string
  default     = null

  validation {
    condition     = var.root_domain == null || can(regex("^[a-z0-9][a-z0-9.-]*\\.[a-z]{2,}$", coalesce(var.root_domain, "x.io")))
    error_message = "root_domain must be a bare apex domain with no scheme or trailing slash, e.g. \"tomame.gh\"."
  }
}

variable "dns_managed_by_vercel" {
  description = <<-EOT
    Whether Vercel is authoritative for root_domain's zone.

    When true, Terraform publishes the DKIM, SPF and DMARC records Resend
    requires directly into that zone, and the provision completes in one apply
    with no manual DNS step — which is the difference between "mail works" and
    "mail works once somebody remembers to paste four records".

    When false, those records are emitted as the resend_dns_records output for
    publishing wherever the zone actually lives.

    ⚠️ This does NOT point the nameservers at Vercel. The provider has no
    resource that registers a domain or takes over a zone, so adding the domain
    to the Vercel account and delegating to its nameservers is a one-time manual
    step. Setting this true beforehand creates records in a zone nobody queries.
  EOT
  type        = bool
  default     = false
}

variable "mail_subdomain" {
  description = <<-EOT
    Subdomain Resend sends from, giving "send.<root_domain>". Sending from a
    subdomain keeps the apex's SPF and DMARC reputation separate from bulk
    transactional mail, so a deliverability problem on receipts cannot poison
    mail sent from the apex later.
  EOT
  type        = string
  default     = "send"
}

# ---------------------------------------------------------------------------
# Vercel
# ---------------------------------------------------------------------------

variable "vercel_api_token" {
  description = "Vercel API token. Supply as TF_VAR_vercel_api_token."
  type        = string
  sensitive   = true
}

variable "vercel_team" {
  description = "Vercel team slug or ID. Null uses the token owner's personal scope."
  type        = string
  default     = null
}

variable "github_repo" {
  description = "owner/repo Vercel builds from."
  type        = string
  default     = "tomamegh/tomame"

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repo))
    error_message = "github_repo must be in owner/repo form."
  }
}

variable "production_branch" {
  description = "Branch whose pushes become production deployments."
  type        = string
  default     = "main"
}

# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------

variable "supabase_access_token" {
  description = "Supabase Management API personal access token (sbp_...). TF_VAR_supabase_access_token."
  type        = string
  sensitive   = true
}

variable "supabase_organization_id" {
  description = "Supabase organization the project is created in."
  type        = string
}

variable "supabase_region" {
  description = <<-EOT
    Supabase region. eu-west-2 (London) is the default: Tomame's customers are in
    Ghana, and London is the closest region with consistently low latency to West
    Africa. Changing this after the first apply DESTROYS AND RECREATES the
    database — Supabase cannot move a project between regions.
  EOT
  type        = string
  default     = "eu-west-2"
}

variable "supabase_instance_size" {
  description = "Compute add-on size. Null keeps the org default (free/nano)."
  type        = string
  default     = null
}

# ---------------------------------------------------------------------------
# Resend
# ---------------------------------------------------------------------------

variable "resend_api_token" {
  description = <<-EOT
    A Resend FULL-ACCESS API key, used only by Terraform to create the sending
    domain and mint the app's restricted sending key. This is not the key the
    application uses — that one is created by this module.
  EOT
  type        = string
  sensitive   = true
}

variable "resend_region" {
  description = "Resend sending region: us-east-1, eu-west-1, sa-east-1 or ap-northeast-1."
  type        = string
  default     = "eu-west-1"

  validation {
    condition     = contains(["us-east-1", "eu-west-1", "sa-east-1", "ap-northeast-1"], var.resend_region)
    error_message = "resend_region must be one of us-east-1, eu-west-1, sa-east-1, ap-northeast-1."
  }
}

# ---------------------------------------------------------------------------
# Application tunables read from the environment
# ---------------------------------------------------------------------------

variable "tax_percentage" {
  description = <<-EOT
    Tax applied to the item price, as a fraction. Read by src/config/pricing.ts,
    which falls back to 0.10 when the variable is absent.

    Set explicitly rather than left to that fallback. It is a money input: an
    environment where nobody set it prices every order at 10% tax while an
    environment where somebody did prices differently, and nothing surfaces the
    difference — the checkout page renders whichever value it got as "Tax (X%)"
    with equal confidence.
  EOT
  type        = number
  default     = 0.10

  validation {
    condition     = var.tax_percentage >= 0 && var.tax_percentage <= 1
    error_message = "tax_percentage is a fraction, not a percentage: 0.10 means 10%."
  }
}

variable "browserless_api_url" {
  description = <<-EOT
    Browserless endpoint for product scraping. The code defaults to
    production-sfo (San Francisco); London is closer to both the Supabase region
    and the sites being scraped, but changing it is a latency decision to make
    deliberately, so the default here matches the code rather than silently
    differing from it.
  EOT
  type        = string
  default     = "https://production-sfo.browserless.io"
}

# ---------------------------------------------------------------------------
# Third-party credentials Terraform cannot create
# ---------------------------------------------------------------------------

variable "third_party_secrets" {
  description = <<-EOT
    Credentials issued by vendors that have no API for minting them, so they are
    inputs rather than resources: Paystack, Apify, Browserless, SerpAPI and the
    two exchange-rate providers. Supply them as TF_VAR_third_party_secrets, or in
    a *.auto.tfvars file — which .gitignore already excludes, and which must
    never be committed.

    The validation below is deliberately strict. Every key here is read by
    src/lib/env.ts or a service that fails at runtime without it, and a missing
    one surfaces as a 500 on a live checkout rather than a failed plan.
  EOT
  type        = map(string)
  sensitive   = true

  validation {
    condition = length(setsubtract([
      "PAYSTACK_SECRET_KEY",
      "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY",
      "APIFY_API_TOKEN",
      "BROWSERLESS_API_KEY",
      "SERPAPI_API_KEY",
      "FREECURRENCY_API_KEY",
      "EXCHANGE_RATE_API_KEY",
    ], keys(var.third_party_secrets))) == 0
    error_message = <<-EOT
      third_party_secrets is missing one or more required keys. All of these must
      be present: PAYSTACK_SECRET_KEY, NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
      APIFY_API_TOKEN, BROWSERLESS_API_KEY, SERPAPI_API_KEY,
      FREECURRENCY_API_KEY, EXCHANGE_RATE_API_KEY.
    EOT
  }

  validation {
    condition     = alltrue([for k, v in var.third_party_secrets : length(trimspace(v)) > 0])
    error_message = "third_party_secrets contains an empty value; env.ts treats empty as missing and throws at boot."
  }
}

variable "optional_third_party_secrets" {
  description = <<-EOT
    Vendor keys for tiers the app treats as optional — it degrades rather than
    fails when they are absent. ScrapingBee is one: its client returns null when
    unconfigured so the extraction pipeline falls through to another scraper.

    Kept separate from third_party_secrets so the distinction is visible. A key
    missing from that map is an outage; a key missing from this one is a
    fallback path being used. The allowlist below stops a genuinely required
    credential from being filed here by mistake, where its absence would be
    silent.
  EOT
  type        = map(string)
  sensitive   = true
  default     = {}

  validation {
    condition = length(setsubtract(keys(var.optional_third_party_secrets), [
      "SCRAPINGBEE_API_KEY",
    ])) == 0
    error_message = "optional_third_party_secrets accepts only SCRAPINGBEE_API_KEY. Anything else the app cannot run without belongs in third_party_secrets."
  }
}
