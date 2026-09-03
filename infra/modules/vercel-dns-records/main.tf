# ---------------------------------------------------------------------------
# DNS records in a Vercel-hosted zone.
#
# Deliberately generic — it knows nothing about Resend. It takes a zone and a
# list of records, so the caller decides what to publish. That keeps the coupling
# in one direction: the Resend module produces records, this one publishes them,
# and neither imports the other.
# ---------------------------------------------------------------------------

locals {
  # Keyed by position rather than by name+type. DKIM commonly returns several
  # TXT records under related names, and a key built from name+type alone can
  # collide between two of them — which Terraform reports as a duplicate
  # for_each key rather than as the record it silently dropped.
  keyed = {
    for index, record in var.records :
    format("%02d-%s-%s", index, lower(record.type), record.name == "" ? "apex" : record.name) => record
  }

  # MX is split from the rest because vercel_dns_record validates that
  # mx_priority is only present on an MX record, and it does that at PLAN time —
  # when a `type == "MX" ? priority : null` conditional is still unknown, so the
  # validator sees the attribute as set and rejects every non-MX record. Two
  # resources sidestep it: each one's type is fixed by which map it iterates.
  mx_records    = { for key, record in local.keyed : key => record if upper(record.type) == "MX" }
  other_records = { for key, record in local.keyed : key => record if upper(record.type) != "MX" }
}

resource "vercel_dns_record" "standard" {
  for_each = local.other_records

  domain = var.zone
  name   = each.value.name
  type   = upper(each.value.type)
  value  = each.value.value

  # 300s matches platform_infra/modules/dns, which has been serving
  # trythorai.com's Resend records on it.
  ttl     = coalesce(each.value.ttl, 300)
  comment = "Managed by Terraform"
}

resource "vercel_dns_record" "mx" {
  for_each = local.mx_records

  domain = var.zone
  name   = each.value.name
  type   = "MX"
  value  = each.value.value

  # 60s for MX, again matching the working thor-v2 configuration.
  ttl         = coalesce(each.value.ttl, 60)
  mx_priority = each.value.priority
  comment     = "Managed by Terraform"
}
