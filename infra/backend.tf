# ---------------------------------------------------------------------------
# State backend — HCP Terraform, configured entirely from the environment.
#
# WHY THIS AND NOT S3
#
# State here holds the Supabase database password, the service-role key and the
# Resend API key in cleartext — Terraform cannot avoid that for values a provider
# returns. So the backend has to give three things: encryption at rest,
# versioning, and locking. HCP Terraform's free tier gives all three with nothing
# to bootstrap, and this machine is already authenticated to app.terraform.io.
#
# S3 would also work, but on Terraform 1.9 it needs a DynamoDB table for locking
# (`use_lockfile`, which locks natively in S3, landed in 1.10). That is two AWS
# resources to create before this directory can run at all, in an account whose
# session is currently expired.
#
# It also rules out the cheap S3-compatible stores. Cloudflare R2 and Backblaze
# B2 both speak the S3 API and both have free tiers, but neither has DynamoDB —
# so on 1.9 they would run WITHOUT STATE LOCKING. Two applies at once then race,
# and the loser's resources are dropped from state while still existing upstream.
# Survivable alone, not worth it when the alternative is free.
#
# NOTHING IS WRITTEN DOWN HERE. An empty `cloud` block is a complete partial
# configuration: the organization, project and workspace all come from the
# environment, so this file works for every environment and commits no account
# identifiers.
#
#     export TF_CLOUD_ORGANIZATION=<your-hcp-org>
#     export TF_CLOUD_PROJECT=tomame
#     export TF_WORKSPACE=tomame-dev          # tomame-prod for production
#     export TF_TOKEN_app_terraform_io=<token>   # or ~/.terraform.d/credentials.tfrc.json
#
#     terraform init
#
# ⚠️ SET THE WORKSPACE TO "LOCAL" EXECUTION MODE the first time.
#
# HCP Terraform defaults a new workspace to REMOTE execution, which runs plan and
# apply on their runners — where none of your TF_VAR_* exist. The first apply
# then fails on a missing variable, and the fix looks like "add every secret to
# the HCP workspace", which is a second place for them to live and go stale.
# Local execution keeps runs on your machine and uses HCP purely as the state
# store, which is what is wanted here.
#
#     Workspace -> Settings -> General -> Execution Mode -> Local
#
# TO USE S3 INSTEAD: replace the block below with `backend "s3" {}` and pass
# -backend-config=bucket=... -backend-config=key=... -backend-config=region=...
# -backend-config=encrypt=true -backend-config=dynamodb_table=... on init. That
# is the shape platform-infra-aws/bootstrap uses.
# ---------------------------------------------------------------------------

terraform {
  cloud {}
}
