# Build commands stay unset: the nextjs preset runs them and package.json owns
# the scripts.

resource "vercel_project" "this" {
  name      = var.name
  framework = var.framework

  git_repository = {
    type              = "github"
    repo              = var.github_repo
    production_branch = var.production_branch
  }

  resource_config = {
    function_default_regions = var.function_regions
  }

  # src/lib/env.ts reads NEXT_PUBLIC_APP_URL, not VERCEL_URL, so every
  # environment agrees on one origin instead of inferring its own.
  automatically_expose_system_environment_variables = false

  # Previews render real orders against the environment's database.
  vercel_authentication = {
    deployment_type = var.vercel_authentication_deployment_type
  }

  # A fork's PR must not run a build holding the service-role key.
  git_fork_protection = true
}

# Separate resources, not the project's inline `environment` set: that set is
# replaced wholesale, so adding one variable briefly removes the rest.

resource "vercel_project_environment_variable" "this" {
  # Iterate the names, not the map: a sensitive for_each is refused because keys
  # become part of the resource address. Names are public; values stay marked.
  for_each = nonsensitive(toset(keys(var.environment_variables)))

  project_id = vercel_project.this.id
  key        = each.value
  value      = var.environment_variables[each.value].value

  # Neither is secret; unmarking keeps the plan readable.
  sensitive = nonsensitive(var.environment_variables[each.value].sensitive)
  target    = nonsensitive(var.environment_variables[each.value].targets)
}

# wait_for_ready is false: blocking on a record someone still has to create
# elsewhere makes every first apply time out.

resource "vercel_project_domain" "this" {
  for_each = toset(var.custom_domains)

  project_id     = vercel_project.this.id
  domain         = each.value
  wait_for_ready = false
}
