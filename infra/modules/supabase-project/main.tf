# ---------------------------------------------------------------------------
# The Supabase project: Postgres, Auth, and the API keys the app authenticates
# with. Everything else about the database — tables, RLS policies, functions —
# is deliberately NOT here. Those live in supabase/migrations/*.sql and are
# applied by the migration tooling, because a schema belongs in version control
# next to the code that queries it, not in a provider's state file.
#
# The split matters on day two: `terraform destroy` must never be able to drop a
# table. It can drop the whole project, which is loud and obvious; it cannot
# quietly remove a column because someone reordered a resource block.
# ---------------------------------------------------------------------------

resource "supabase_project" "this" {
  name              = var.name
  organization_id   = var.organization_id
  region            = var.region
  database_password = var.database_password
  instance_size     = var.instance_size

  lifecycle {
    # Region and organization are immutable upstream. Terraform's only way to
    # honour a change is destroy-then-create, which silently discards every row
    # in the database. Refuse instead, and make the operator move the data.
    prevent_destroy = true

    ignore_changes = [
      # Rotating the password is a break-glass operation done in the dashboard
      # under incident pressure. Terraform must not quietly revert it on the next
      # unrelated apply.
      database_password,
    ]
  }
}

# ---------------------------------------------------------------------------
# Project settings.
#
# Both attributes are raw JSON forwarded to the Supabase Management API. The
# provider does not validate the field names, so an unrecognised key fails at
# apply rather than at plan. The fields set here are the documented ones; if you
# add to extra_auth_settings, check it against the Management API reference
# first.
# ---------------------------------------------------------------------------

resource "supabase_settings" "this" {
  project_ref = supabase_project.this.id

  api = jsonencode({
    db_schema            = var.db_schema
    db_extra_search_path = "public, extensions"
    max_rows             = var.max_rows
  })

  auth = jsonencode(merge(
    {
      site_url                              = var.site_url
      uri_allow_list                        = join(",", var.additional_redirect_urls)
      jwt_exp                               = var.jwt_expiry_seconds
      disable_signup                        = !var.enable_signup
      mailer_autoconfirm                    = false
      mailer_secure_email_change_enabled    = true
      refresh_token_rotation_enabled        = true
      security_refresh_token_reuse_interval = 10
    },
    var.extra_auth_settings,
  ))
}

# ---------------------------------------------------------------------------
# API keys.
#
# Read rather than created: Supabase mints these with the project and there is
# no operation to rotate them through this provider. Reading them keeps the
# credential flow in one direction — the project is the source, everything
# downstream (Vercel) is a copy that Terraform refreshes.
# ---------------------------------------------------------------------------

data "supabase_apikeys" "this" {
  project_ref = supabase_project.this.id
}
