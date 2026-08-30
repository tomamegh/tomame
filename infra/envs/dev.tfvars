environment = "dev"
product     = "tomame"

# No domain yet. The app is served on https://tomame-dev.vercel.app and mail
# goes out over Resend's shared onboarding domain. Set this once you own a
# domain — NOT tomame.com, which is parked at Afternic and not yours.
root_domain = null

github_repo       = "tomamegh/tomame"
production_branch = "main"

# London — closest region to Ghana with consistent latency. Immutable after the
# first apply: changing it destroys and recreates the database.
supabase_region        = "eu-west-2"
supabase_instance_size = null

resend_region = "eu-west-1"

# supabase_organization_id is intentionally absent. It identifies the account
# being billed, so it is supplied per-operator rather than committed:
#
#     TF_VAR_supabase_organization_id=... terraform plan -var-file=envs/dev.tfvars
#
# Every credential — vercel_api_token, supabase_access_token, resend_api_token,
# third_party_secrets — arrives as TF_VAR_*, from your shell or a *.auto.tfvars
# file that .gitignore excludes. None of them belong in this file, which is
# committed. See README.md.
