output "domain_id" {
  description = "Resend's id for the sending domain."
  value       = restful_resource.domain.output.id
}

output "domain_status" {
  description = "not_started | pending | verified | failed."
  value       = try(restful_resource.domain.output.status, "unknown")
}

output "dns_records" {
  description = "DKIM, SPF and DMARC records Resend requires. Names are relative to the zone."
  value       = try(restful_resource.domain.output.records, [])
}

output "api_key" {
  description = "RESEND_API_KEY. Returned only at creation; state is the only copy."
  value       = try(restful_operation.api_key.sensitive_output.token, null)
  sensitive   = true
}
