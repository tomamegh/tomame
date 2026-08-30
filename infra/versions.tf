terraform {
  required_version = ">= 1.9.0"

  required_providers {
    # Versions verified against the registry on 2026-08-29. Pinned with `~>` so a
    # patch lands without a code change but a minor never arrives unannounced —
    # three of these four providers are self-signed community builds and a minor
    # bump has broken attribute names before.
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
