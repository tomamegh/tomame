# ---------------------------------------------------------------------------
# Ask Resend to check the sending domain's DNS records.
#
# Separated from modules/resend-domain so the caller can order it AFTER the
# records are published. Inside that module it necessarily ran at creation time
# — before any record existed — so it always reported not_started and a second
# apply was needed. As its own module it can carry a depends_on, and when the
# zone is managed by Vercel the whole thing converges in one apply.
#
# An action, not a resource: there is nothing to destroy and re-running it is
# harmless.
# ---------------------------------------------------------------------------

resource "restful_operation" "verify" {
  path   = "/domains/${var.domain_id}/verify"
  method = "POST"

  # Re-runs when the domain is replaced, so a new domain is never left
  # unverified because an operation for the old one was still in state.
  id_builder = "verify/${var.domain_id}"
}
