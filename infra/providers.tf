provider "vercel" {
  api_token = var.vercel_api_token
  team      = var.vercel_team
}

provider "supabase" {
  access_token = var.supabase_access_token
}

# Resend has no provider; this is a generic REST client. The token is
# full-access and used only by Terraform — the app's key is scoped to sending.
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
