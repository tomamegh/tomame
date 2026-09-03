variable "name" {
  description = "Vercel project name, e.g. \"tomame-prod\"."
  type        = string
}

variable "github_repo" {
  description = "owner/repo Vercel builds from."
  type        = string
}

variable "production_branch" {
  description = "Branch whose pushes deploy to production."
  type        = string
}

variable "framework" {
  description = "Vercel framework preset. \"nextjs\" gives App Router routing, ISR and image optimization."
  type        = string
  default     = "nextjs"
}

variable "function_regions" {
  description = <<-EOT
    Regions functions execute in. Should match the Supabase region: every request
    in this app makes several round trips to Postgres, and a cross-continent hop
    is paid on each one.

    Set through resource_config, not the older serverless_function_region, which
    the provider now reports as deprecated.
  EOT
  type        = set(string)
  default     = ["lhr1"]
}

variable "custom_domains" {
  description = <<-EOT
    Domains served by this project, apex first. Empty means the project is
    reachable only on its *.vercel.app URLs, which is a valid state — it is what
    an environment looks like before a domain exists.
  EOT
  type        = list(string)
  default     = []
}

variable "environment_variables" {
  description = <<-EOT
    Environment variables for the project, keyed by name.

    `sensitive` controls whether the value can be read back in the Vercel UI
    after it is written. Anything named NEXT_PUBLIC_* must be non-sensitive:
    Next.js inlines those into the client bundle at build time, so marking one
    sensitive hides it from the dashboard while still publishing it to every
    visitor — the worst of both. The validation below enforces that, and the
    inverse for everything else.
  EOT
  type = map(object({
    value     = string
    sensitive = bool
    targets   = optional(set(string), ["production", "preview", "development"])
  }))
  sensitive = true

  validation {
    condition = alltrue([
      for k, v in var.environment_variables :
      !v.sensitive if startswith(k, "NEXT_PUBLIC_")
    ])
    error_message = "A NEXT_PUBLIC_* variable cannot be sensitive; Next.js inlines it into the browser bundle regardless."
  }

  validation {
    condition = alltrue([
      for k, v in var.environment_variables :
      v.sensitive if !startswith(k, "NEXT_PUBLIC_")
    ])
    error_message = "A non-NEXT_PUBLIC_ variable must be sensitive; it is a server-side secret."
  }

  validation {
    condition = alltrue([
      for k, v in var.environment_variables :
      length(setsubtract(v.targets, ["production", "preview", "development"])) == 0
    ])
    error_message = "targets may only contain production, preview or development."
  }

  validation {
    condition = alltrue([
      for k, v in var.environment_variables :
      !contains(v.targets, "development") if v.sensitive
    ])
    error_message = <<-EOT
      A sensitive variable cannot target `development`. Vercel rejects it —
      `vercel env pull` writes development variables to a local .env file, so
      they must stay readable. Target production and preview only; local
      development reads .env.
    EOT
  }
}

variable "vercel_authentication_deployment_type" {
  description = <<-EOT
    Who may view deployments. "standard_protection" puts preview deployments
    behind Vercel SSO while leaving production public — the right default for a
    storefront whose previews show real order data. "none" makes previews
    publicly readable.
  EOT
  type        = string
  default     = "standard_protection"

  validation {
    condition = contains([
      "standard_protection",
      "all_deployments",
      "only_preview_deployments",
      "none",
    ], var.vercel_authentication_deployment_type)
    error_message = "Invalid deployment_type for vercel_authentication."
  }
}
