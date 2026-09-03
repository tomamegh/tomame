# The project only. Schema lives in supabase/migrations/*.sql, so terraform
# destroy can drop the whole project but never a single table.

resource "supabase_project" "this" {
  name              = var.name
  organization_id   = var.organization_id
  region            = var.region
  database_password = var.database_password
  instance_size     = var.instance_size

  lifecycle {
    # Region is immutable upstream, so a change here would destroy the database.
    prevent_destroy = true

    # A password rotated in the dashboard must survive the next apply.
    ignore_changes = [database_password]
  }
}

# Raw JSON forwarded to the Management API; the provider validates no field
# names, so an unrecognised key fails at apply rather than plan.

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

# Read, not created: Supabase mints these with the project.

data "supabase_apikeys" "this" {
  project_ref = supabase_project.this.id
}
