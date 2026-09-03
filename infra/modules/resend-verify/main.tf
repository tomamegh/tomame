# Separate from resend-domain so the caller can order it after the DNS records
# are published; inside that module it could only run before they existed.
resource "restful_operation" "verify" {
  path   = "/domains/${var.domain_id}/verify"
  method = "POST"

  # Re-runs when the domain is replaced.
  id_builder = "verify/${var.domain_id}"
}
