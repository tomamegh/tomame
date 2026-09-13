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

# Supabase Management API, read through the same generic REST client. The
# supabase/supabase provider's apikeys data source hard-codes `reveal=true`,
# which Supabase now answers 403 for every scoped personal access token
# (supabase/supabase#50244) — and scoped tokens are the only kind that can be
# created. The plain list endpoint still returns every key value, so the keys
# are read here instead. Same access token the supabase provider uses.
provider "restful" {
  alias    = "supabase"
  base_url = "https://api.supabase.com"

  security = {
    http = {
      token = {
        token = var.supabase_access_token
      }
    }
  }
}

provider "random" {}
