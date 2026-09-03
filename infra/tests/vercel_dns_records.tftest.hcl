# ---------------------------------------------------------------------------
# Tests for modules/vercel-dns-records.
#
#     cd infra && terraform test
#
# The provider is mocked, so this needs no Vercel token and runs in CI. It
# cannot prove Vercel accepts these records — only a real apply does that — but
# it does prove the module rejects the malformed input it is most likely to be
# handed, which is the part that would otherwise fail silently.
#
# Resend's records arrive through a generic REST client that cannot validate the
# response shape. A renamed field there becomes an empty string, not an error,
# and an empty DNS record resolves fine and verifies nothing. Everything below
# exists to make that loud.
# ---------------------------------------------------------------------------

mock_provider "vercel" {}

variables {
  zone = "tomame.gh"
}

run "publishes_a_standard_record" {
  command = plan

  module {
    source = "./modules/vercel-dns-records"
  }

  variables {
    records = [
      { name = "resend._domainkey.send", type = "TXT", value = "p=MIGfMA0GCSq" },
    ]
  }

  assert {
    condition     = length(vercel_dns_record.standard) == 1
    error_message = "A TXT record should be created by the standard resource."
  }

  assert {
    condition     = length(vercel_dns_record.mx) == 0
    error_message = "A TXT record must not be created by the MX resource."
  }
}

run "routes_mx_to_its_own_resource" {
  command = plan

  module {
    source = "./modules/vercel-dns-records"
  }

  variables {
    records = [
      { name = "send", type = "MX", value = "feedback-smtp.eu-west-1.amazonses.com", priority = 10 },
      { name = "send", type = "TXT", value = "v=spf1 include:amazonses.com ~all" },
    ]
  }

  # The split exists because vercel_dns_record validates at plan time that
  # mx_priority is only set on MX. A single resource with a conditional fails
  # that check, because the type is not known when the validator runs.
  assert {
    condition     = length(vercel_dns_record.mx) == 1
    error_message = "The MX record should be created by the MX resource."
  }

  assert {
    condition     = length(vercel_dns_record.standard) == 1
    error_message = "The TXT record should be created by the standard resource."
  }

  assert {
    condition     = one(values(vercel_dns_record.mx)).mx_priority == 10
    error_message = "MX priority must be carried through; Vercel rejects an MX record without one."
  }
}

run "keys_stay_distinct_for_same_name_and_type" {
  command = plan

  module {
    source = "./modules/vercel-dns-records"
  }

  # DKIM commonly returns several records under related names. Keying by
  # name+type alone collides between two of them, and Terraform reports that as
  # a duplicate key rather than as the record it dropped.
  variables {
    records = [
      { name = "send", type = "TXT", value = "first" },
      { name = "send", type = "TXT", value = "second" },
      { name = "send", type = "TXT", value = "third" },
    ]
  }

  assert {
    condition     = length(vercel_dns_record.standard) == 3
    error_message = "Three records with the same name and type must all be created, not collapsed into one."
  }
}

run "rejects_an_mx_record_with_no_priority" {
  command = plan

  module {
    source = "./modules/vercel-dns-records"
  }

  variables {
    records = [
      { name = "send", type = "MX", value = "feedback-smtp.eu-west-1.amazonses.com" },
    ]
  }

  expect_failures = [var.records]
}

run "rejects_an_empty_value" {
  command = plan

  module {
    source = "./modules/vercel-dns-records"
  }

  # What a renamed field in Resend's response actually looks like by the time it
  # reaches here.
  variables {
    records = [
      { name = "resend._domainkey.send", type = "TXT", value = "" },
    ]
  }

  expect_failures = [var.records]
}

run "rejects_a_fully_qualified_name" {
  command = plan

  module {
    source = "./modules/vercel-dns-records"
  }

  # Vercel wants names relative to the zone. A fully-qualified one would be
  # published as send.tomame.gh.tomame.gh.
  variables {
    records = [
      { name = "send.tomame.gh.", type = "TXT", value = "v=spf1 -all" },
    ]
  }

  expect_failures = [var.records]
}

run "rejects_an_unsupported_type" {
  command = plan

  module {
    source = "./modules/vercel-dns-records"
  }

  variables {
    records = [
      { name = "send", type = "SPF", value = "v=spf1 -all" },
    ]
  }

  expect_failures = [var.records]
}

run "falls_back_to_per_type_ttl_when_resend_reports_auto" {
  command = plan

  module {
    source = "./modules/vercel-dns-records"
  }

  # Resend reports ttl as a string that is sometimes "Auto", which tonumber
  # cannot coerce — the caller passes null and the defaults apply.
  variables {
    records = [
      { name = "send", type = "MX", value = "feedback-smtp.eu-west-1.amazonses.com", priority = 10 },
      { name = "send", type = "TXT", value = "v=spf1 include:amazonses.com ~all" },
    ]
  }

  assert {
    condition     = one(values(vercel_dns_record.mx)).ttl == 60
    error_message = "MX should fall back to 60s."
  }

  assert {
    condition     = one(values(vercel_dns_record.standard)).ttl == 300
    error_message = "Non-MX should fall back to 300s."
  }
}

run "honours_an_explicit_ttl" {
  command = plan

  module {
    source = "./modules/vercel-dns-records"
  }

  variables {
    records = [
      { name = "send", type = "TXT", value = "v=spf1 -all", ttl = 3600 },
    ]
  }

  assert {
    condition     = one(values(vercel_dns_record.standard)).ttl == 3600
    error_message = "An explicit ttl must be used rather than the default."
  }
}
