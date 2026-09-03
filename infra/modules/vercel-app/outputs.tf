output "project_id" {
  description = "Vercel project id — the value `vercel link` writes into .vercel/project.json."
  value       = vercel_project.this.id
}

output "project_name" {
  description = "Vercel project name."
  value       = vercel_project.this.name
}

output "default_url" {
  description = <<-EOT
    The always-present production URL Vercel derives from the project name. Used
    as NEXT_PUBLIC_APP_URL until a custom domain exists, so the app has a real
    origin to build auth callbacks and Paystack return URLs from on day one.
  EOT
  value       = "https://${vercel_project.this.name}.vercel.app"
}

output "domains" {
  description = <<-EOT
    Attached custom domains and whether Vercel considers each one misconfigured.
    A true here means the DNS records have not been published or have not
    propagated; the domain will not serve until it clears.
  EOT
  value = {
    for domain, resource in vercel_project_domain.this :
    domain => {
      verified      = resource.verified
      misconfigured = resource.misconfigured
    }
  }
}
