provider "vercel" {
  api_token = var.vercel_api_token
  team      = var.vercel_team
}

provider "supabase" {
  access_token = var.supabase_access_token
}

# Resend has no provider of its own; this is a generic REST client pointed at
# their API. The bearer token is a full-access Resend key used only by Terraform
# — the application's key is created by modules/resend-domain and is scoped to
# sending only.
provider "restful" {
  base_url = "https://api.resend.com"

  security = {
    http = {
      token = {
        token = var.resend_api_token
      }
    }
  }
}

provider "random" {}
