environment = "prod"
product     = "tomame"

# ⚠️ Production takes real payments and sends real customer email. Set a domain
# you actually control before applying this: without one, order confirmations go
# out from Resend's shared onboarding domain, which is rate limited and does not
# carry the brand.
#
# NOT tomame.com — parked at Afternic, registered 2005, clientTransferProhibited,
# publishing `v=spf1 -all` and a null MX. It cannot be verified.
root_domain = "tomame.ca"

vercel_team       = "albertahadjie-6953s-projects"
github_repo       = "tomamegh/tomame"
production_branch = "main"

supabase_region = "eu-west-2"

# Production runs a paid compute tier. The free tier pauses a project after a
# week of inactivity, and a paused project means a customer's checkout fails.
# ⚠️ Was "small". The org is on the FREE plan, which rejects any instance_size
# outright: "Instance size cannot be specified for free plan organizations"
# (HTTP 402). Restore "small" the moment the org goes Pro — on free tier the
# project PAUSES after a week of inactivity, and a paused database means a
# customer's checkout fails.
supabase_instance_size = null

resend_region = "eu-west-1"

supabase_organization_id = "wlefnkvgdjuyksgibxyf"

# ⚠️ Free tier is two projects per organization, and the hand-made "Tomame"
# project plus tomame-dev already fill it. Applying this one needs that manual
# project removed, or a paid plan on the org.

# Every credential arrives as TF_VAR_*, from your shell or a *.auto.tfvars file
# that .gitignore excludes. See README.md.

# ---------------------------------------------------------------------------
# Records the zone carries that Terraform does not generate.
#
# Exported from GoDaddy before delegation. Resend's records are absent on
# purpose — the resend module produces those, and a duplicate here is a
# for_each collision. The apex A and www are absent too: Vercel writes them
# when the domain is attached to the project.
#
# Two values were changed from what GoDaddy served:
#   - apex SPF was `include:dc-aa8e722993._spfm.tomame.ca`, GoDaddy Domain
#     Connect indirection that only resolves inside the GoDaddy zone. Flattened
#     to the include it wrapped.
#   - _dmarc dropped `rua=mailto:dmarc_rua@onsecureserver.net`, GoDaddy's
#     collector. ⚠️ Add an address you own to get failure reports again.
# ---------------------------------------------------------------------------

dns_managed_by_vercel = false

additional_dns_records = [
  { name = "", type = "MX", value = "aspmx.l.google.com", priority = 1 },
  { name = "", type = "MX", value = "alt1.aspmx.l.google.com", priority = 5 },
  { name = "", type = "MX", value = "alt2.aspmx.l.google.com", priority = 5 },
  { name = "", type = "MX", value = "alt3.aspmx.l.google.com", priority = 10 },
  { name = "", type = "MX", value = "alt4.aspmx.l.google.com", priority = 10 },
  { name = "", type = "TXT", value = "v=spf1 include:_spf.google.com ~all" },
  { name = "_dmarc", type = "TXT", value = "v=DMARC1; p=quarantine; adkim=r; aspf=r;" },
  { name = "google._domainkey", type = "TXT", value = "v=DKIM1;k=rsa;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtcdld3vdJobuvU1ryOyaToWmu5i/0ip6s0LI6x7wVE19BrVmjXIVZoE0txGHwBA3yCDFrQahL6WfdO3Efo2LHVj61BeBK/9KI/bnsGSdI/Md23CNlNKrLKtR4ENiBZrwfqcQhPUt/mQ/v8wTqd1EY+JewHC8J75UCBdOWkeTobCAm1XNmFIRmXclkIYaEFd7DNfP/mrBIuCbro6UwMDFzb/I+39V6wVN1qGB1peuN3Wy1xmBsdGtj2kWo7dJ3Lvl+BRU2MxHpZ75HDUaMOfDZPk8L63sv6mN434ZuYd9kTBFeTevHqs7Qd/p31nWI9PLOW6qA40JYide4bPQrMjJbwIDAQAB" },
]
