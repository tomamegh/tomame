output "response" {
  description = <<-EOT
    Resend's reply to the verification request. Note this is the reply to the
    REQUEST, not proof of verification: Resend checks DNS asynchronously, and a
    record published seconds earlier may not have propagated. The authoritative
    answer is resend_domain_status on the next refresh.
  EOT
  value       = try(restful_operation.verify.output, null)
}
