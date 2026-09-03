# ---------------------------------------------------------------------------
# Resend, driven over its REST API.
#
# WHY THIS LOOKS DIFFERENT FROM THE OTHER MODULES
#
# There is no Resend Terraform provider. As of 2026-08-29 the registry has no
# resend/resend, resendlabs/resend, drfaust92/resend or adaptive-scale/resend —
# all four were probed and none resolve. So this module speaks to Resend's API
# directly through magodo/restful, a generic REST client.
#
# The consequence worth knowing: a first-party provider knows the shape of its
# own API, and this one does not. Field names below come from Resend's public
# API and are asserted, not verified by a provider schema. A wrong field fails
# at APPLY, not at plan. Run this module against a throwaway Resend account
# before pointing it at the real one.
#
# If Resend ever ships a provider, this module is the only thing that changes;
# nothing outside it knows how the domain gets created.
# ---------------------------------------------------------------------------

# POST /domains -> { id, name, status, records: [...] }
resource "restful_resource" "domain" {
  path = "/domains"

  body = {
    name   = var.sending_domain
    region = var.region
  }

  # The create response carries the id; every later read addresses the resource
  # by it. $(body.id) refers to that create response, not to `body` above.
  read_path = "$(path)/$(body.id)"

  # Resend has no PATCH for a domain. Anything changed here is a replacement,
  # and saying so explicitly beats a confusing "update not supported" at apply.
  force_new_attrs = ["name", "region"]

  # The DNS records are the entire point of creating the domain — surface them
  # so the caller can publish them.
  output_attrs = ["id", "name", "status", "records"]
}

# Verification lives in modules/resend-verify, not here. Inside this module it
# could only ever run at creation time — before any DNS record existed — so it
# always reported not_started and needed a second apply. As a separate module
# the caller can order it after the records are published.

# ---------------------------------------------------------------------------
# The application's sending key.
#
# use_sensitive_output routes the whole response into sensitive_output, because
# Resend returns the token exactly once, on create. It is unreadable afterwards:
# lose it and the only recovery is to taint this resource and mint a new one.
#
# It is in Terraform state either way, which is why backend.tf insists on an
# encrypted remote bucket.
# ---------------------------------------------------------------------------

resource "restful_resource" "api_key" {
  path = "/api-keys"

  body = {
    name       = var.api_key_name
    permission = var.api_key_permission
    domain_id  = restful_resource.domain.output.id
  }

  read_path = "$(path)/$(body.id)"

  use_sensitive_output = true

  # A changed name or scope means a different key. Replacing is correct; there
  # is no update endpoint.
  force_new_attrs = ["name", "permission", "domain_id"]

  lifecycle {
    # The new key must exist before the old one is revoked, or every email the
    # app tries to send between the two operations is rejected.
    create_before_destroy = true
  }
}
