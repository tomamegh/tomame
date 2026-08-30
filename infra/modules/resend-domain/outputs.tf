output "domain_id" {
  description = "Resend's id for the sending domain."
  value       = restful_resource.domain.output.id
}

output "domain_status" {
  description = <<-EOT
    Verification state as of the last refresh: not_started, pending, verified or
    failed. Expect "not_started" on a first apply — the records below do not
    exist yet at the moment Resend is asked to check them.
  EOT
  value       = try(restful_resource.domain.output.status, "unknown")
}

output "dns_records" {
  description = <<-EOT
    The DKIM, SPF and DMARC records Resend requires. Until every one of these is
    published on the sending domain and has propagated, Resend rejects sends and
    customers receive no order confirmations.

    Publish them with whatever holds the zone, then re-apply so the verify
    operation re-runs. This output is deliberately not wired into a DNS resource:
    the zone for this domain is not managed by this stack, and guessing at a
    provider for it would create records in the wrong place.
  EOT
  value       = try(restful_resource.domain.output.records, [])
}

output "api_key" {
  description = <<-EOT
    RESEND_API_KEY for the application. Returned by Resend only at creation —
    there is no endpoint that reads it back, so this output and Terraform state
    are the only copies.
  EOT
  value       = try(restful_resource.api_key.sensitive_output.token, null)
  sensitive   = true
}
