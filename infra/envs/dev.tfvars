environment = "dev"
product     = "tomame"

# dev serves on dev.tomame.ca and sends from send.tomame.ca.
root_domain = "tomame.ca"

# Register the apex with Resend, not send.tomame.ca. Resend names its bounce MX
# send.<registered domain>, so a subdomain yields send.send.tomame.ca.
mail_subdomain = ""

# Nameservers are delegated to Vercel, so Terraform publishes Resend's DKIM,
# SPF and DMARC records into the zone itself.
#
# ⚠️ Two applies, the first targeted — the record set does not exist until the
# Resend domain does, and Terraform needs for_each keys at plan time:
#
#     terraform apply -target=module.resend
#     terraform apply
#
# ⚠️ tomame.ca carried LIVE GOOGLE WORKSPACE MAIL (MX at aspmx.l.google.com) on
# GoDaddy's nameservers. Those MX records and the SPF do not follow a
# delegation — they must be recreated in Vercel DNS or mail to every
# @tomame.ca address bounces. This stack does not manage them.
dns_managed_by_vercel = true

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
