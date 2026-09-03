# Resend has no Terraform provider, so this drives its REST API through a
# generic client. Field names are unvalidated: a wrong one fails at apply.

resource "restful_resource" "domain" {
  path = "/domains"

  body = {
    name   = var.sending_domain
    region = var.region
  }

  read_path       = "$(path)/$(body.id)"
  force_new_attrs = ["name", "region"]
  output_attrs    = ["id", "name", "status", "records"]
}

# An operation, not a resource: Resend returns 405 for GET /api-keys/{id}, so
# there is nothing to read back. Destroying this does not revoke the key.
resource "restful_operation" "api_key" {
  path   = "/api-keys"
  method = "POST"

  body = {
    name       = var.api_key_name
    permission = var.api_key_permission
    domain_id  = restful_resource.domain.output.id
  }

  id_builder           = "api-key/${restful_resource.domain.output.id}"
  use_sensitive_output = true
}
