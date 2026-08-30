environment = "prod"
product     = "tomame"

# ⚠️ Production takes real payments and sends real customer email. Set a domain
# you actually control before applying this: without one, order confirmations go
# out from Resend's shared onboarding domain, which is rate limited and does not
# carry the brand.
#
# NOT tomame.com — parked at Afternic, registered 2005, clientTransferProhibited,
# publishing `v=spf1 -all` and a null MX. It cannot be verified.
root_domain = null

github_repo       = "tomamegh/tomame"
production_branch = "main"

supabase_region = "eu-west-2"

# Production runs a paid compute tier. The free tier pauses a project after a
# week of inactivity, and a paused project means a customer's checkout fails.
supabase_instance_size = "small"

resend_region = "eu-west-1"

# supabase_organization_id and every credential arrive as TF_VAR_*, from your
# shell or a *.auto.tfvars file that .gitignore excludes. See README.md.
