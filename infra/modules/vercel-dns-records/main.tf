# Generic: takes a zone and a list of records, and knows nothing about Resend.

locals {
  # Keyed by position — two DKIM records can share a name and type, and a key
  # built from those alone collides instead of creating both.
  keyed = {
    for index, record in var.records :
    format("%02d-%s-%s", index, lower(record.type), record.name == "" ? "apex" : record.name) => record
  }

  # Split by type: vercel_dns_record rejects mx_priority on a non-MX record, and
  # validates that at plan time when a conditional is still unknown.
  mx_records    = { for key, record in local.keyed : key => record if upper(record.type) == "MX" }
  other_records = { for key, record in local.keyed : key => record if upper(record.type) != "MX" }
}

resource "vercel_dns_record" "standard" {
  for_each = local.other_records

  domain = var.zone
  name   = each.value.name
  type   = upper(each.value.type)
  value  = each.value.value

  ttl     = coalesce(each.value.ttl, 300)
  comment = "Managed by Terraform"
}

resource "vercel_dns_record" "mx" {
  for_each = local.mx_records

  domain = var.zone
  name   = each.value.name
  type   = "MX"
  value  = each.value.value

  ttl         = coalesce(each.value.ttl, 60)
  mx_priority = each.value.priority
  comment     = "Managed by Terraform"
}
