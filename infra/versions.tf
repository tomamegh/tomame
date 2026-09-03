terraform {
  required_version = ">= 1.9.0"

  required_providers {
    # Pinned with `~>`: three of these are self-signed community builds.
    vercel = {
      source  = "vercel/vercel"
      version = "~> 5.14"
    }
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.10"
    }
    # There is no Resend provider. Checked resend/resend, resendlabs/resend,
    # drfaust92/resend and adaptive-scale/resend — none exist. Resend's REST API
    # is driven through a generic client instead; see modules/resend-domain.
    restful = {
      source  = "magodo/restful"
      version = "~> 0.25"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
