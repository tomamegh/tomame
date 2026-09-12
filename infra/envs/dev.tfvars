environment = "dev"
product     = "tomame"

# No domain yet. The app is served on https://tomame-dev.vercel.app and mail
# goes out over Resend's shared onboarding domain. Set this once you own a
# domain — NOT tomame.com, which is parked at Afternic and not yours.
root_domain = "tomame.ca"

# dev gets its own sending subdomain. sending_domain is built from
# mail_subdomain + root_domain with no environment in it, so leaving this at the
# default would have dev and prod both create the Resend domain send.tomame.ca
# and publish the same records into the same zone, from two separate states.
mail_subdomain = "send-dev"

# prod owns the zone. dev attaches dev.tomame.ca and publishes nothing.
dns_managed_by_vercel = false

vercel_team       = "albertahadjie-6953s-projects"
github_repo       = "tomamegh/tomame"
production_branch = "main"

# London — closest region to Ghana with consistent latency. Immutable after the
# first apply: changing it destroys and recreates the database.
supabase_region        = "eu-west-2"
supabase_instance_size = null

resend_region = "eu-west-1"

# "Tomame Concierge". An account identifier, not a secret, so it is committed —
# an apply that needs an environment variable to reach the right account is one
# that eventually reaches the wrong one.
supabase_organization_id = "wlefnkvgdjuyksgibxyf"

# ⚠️ A project named "Tomame" (ref stronkcopniokqwlnydn, us-west-2) already
# exists in this org, created by hand. Terraform deliberately does NOT adopt it
# and will create tomame-dev alongside. The free tier allows two projects per
# organization, so that is the second and last: provisioning prod here needs the
# manual project deleted first, or a paid plan.

# Every credential — vercel_api_token, supabase_access_token, resend_api_token,
# third_party_secrets — arrives as TF_VAR_*, from your shell or a *.auto.tfvars
# file that .gitignore excludes. None of them belong in this file, which is
# committed. See README.md.
