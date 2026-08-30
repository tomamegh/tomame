# ---------------------------------------------------------------------------
# The Vercel project.
#
# Build commands are left unset on purpose. Vercel's nextjs preset already runs
# `next build`, and package.json owns `build`, `lint` and `typecheck`. Naming
# the command here would create a second place to change it, and the two drift
# the first time someone edits only one.
# ---------------------------------------------------------------------------

resource "vercel_project" "this" {
  name      = var.name
  framework = var.framework

  git_repository = {
    type              = "github"
    repo              = var.github_repo
    production_branch = var.production_branch
  }

  serverless_function_region = var.serverless_function_region

  # Off by default. Vercel injects VERCEL_URL, VERCEL_ENV and friends when this
  # is on, and src/lib/env.ts reads none of them — it wants NEXT_PUBLIC_APP_URL,
  # which is set explicitly below so that preview, production and local all agree
  # on one origin rather than each inferring a different one.
  automatically_expose_system_environment_variables = false

  # Previews of this app render real orders and real customer names against the
  # environment's database. They are not public artifacts.
  vercel_authentication = {
    deployment_type = var.vercel_authentication_deployment_type
  }

  # A fork's pull request must not be able to run a build that holds the Supabase
  # service-role key.
  git_fork_protection = true
}

# ---------------------------------------------------------------------------
# Environment variables.
#
# Separate resources rather than the inline `environment` set on the project:
# an inline set is replaced wholesale on any change, so adding one variable
# briefly removes the rest, and a deployment landing in that window builds
# without them. One resource per variable also makes the plan legible — you see
# "1 to add" instead of "1 to change" covering an opaque set.
# ---------------------------------------------------------------------------

resource "vercel_project_environment_variable" "this" {
  # Iterate over the NAMES, not the map.
  #
  # environment_variables is sensitive as a whole, and Terraform refuses a
  # sensitive for_each because instance keys become part of the resource address
  # — they appear in plan output, in state and in every error message. That
  # restriction is about the keys, and the keys here are variable names like
  # NEXT_PUBLIC_SUPABASE_URL, which are already public in src/lib/env.ts and in
  # the managed_env_keys output. nonsensitive() asserts exactly that, and nothing
  # about the values: each value is looked up below and stays marked.
  for_each = nonsensitive(toset(keys(var.environment_variables)))

  project_id = vercel_project.this.id
  key        = each.value
  value      = var.environment_variables[each.value].value

  # Neither of these is secret — one is a boolean, the other a list of Vercel
  # environment names. Unmarking them keeps the plan readable, so a reviewer can
  # see which targets a variable lands in instead of "(sensitive value)".
  sensitive = nonsensitive(var.environment_variables[each.value].sensitive)
  target    = nonsensitive(var.environment_variables[each.value].targets)
}

# ---------------------------------------------------------------------------
# Custom domains.
#
# wait_for_ready is false because the DNS for these domains is not managed by
# this stack. Blocking the apply on a record that a human still has to create
# elsewhere turns every first apply into a timeout. `misconfigured` on the
# resource, surfaced in the domains output, is how you check afterwards.
# ---------------------------------------------------------------------------

resource "vercel_project_domain" "this" {
  for_each = toset(var.custom_domains)

  project_id     = vercel_project.this.id
  domain         = each.value
  wait_for_ready = false
}
