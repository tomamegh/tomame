variable "zone" {
  description = <<-EOT
    The apex domain whose zone Vercel hosts, e.g. "tomame.gh".

    ⚠️ Vercel must already be authoritative for it — the domain added to the
    account and its nameservers pointed at Vercel. The provider has no resource
    that registers a domain or takes over a zone (there is `vercel_dns_record`
    and `vercel_project_domain`, and nothing that creates the zone itself), so
    that step happens once, out of band. Applying against a zone Vercel does not
    serve creates records nobody can resolve.
  EOT
  type        = string
}

variable "records" {
  description = <<-EOT
    Records to publish, with `name` RELATIVE to the zone: "send" for
    send.<zone>, "" for the apex. The caller does that normalization, because it
    knows where the names came from.

    `priority` is only read for MX records and ignored otherwise.

    `ttl` is optional because Resend reports it as a string that is sometimes
    "Auto" rather than a number. A null falls back to the per-type defaults
    below, matching what platform_infra/modules/dns has been running.
  EOT
  type = list(object({
    name     = string
    type     = string
    value    = string
    ttl      = optional(number)
    priority = optional(number)
  }))

  validation {
    condition = alltrue([
      for record in var.records :
      contains(["A", "AAAA", "ALIAS", "CAA", "CNAME", "MX", "NS", "TXT"], upper(record.type))
    ])
    error_message = "Unsupported DNS record type; vercel_dns_record accepts A, AAAA, ALIAS, CAA, CNAME, MX, NS or TXT."
  }

  validation {
    condition = alltrue([
      for record in var.records :
      upper(record.type) != "MX" || record.priority != null
    ])
    error_message = "An MX record needs a priority; Vercel rejects one without it."
  }

  validation {
    condition = alltrue([
      for record in var.records :
      !endswith(record.name, ".")
    ])
    error_message = "Record names must be relative to the zone and unterminated — \"send\", not \"send.example.com.\"."
  }

  validation {
    condition = alltrue([
      for record in var.records :
      length(trimspace(record.value)) > 0
    ])
    error_message = <<-EOT
      A record has an empty value. These records come from Resend through a
      generic REST client that cannot validate the response shape, so a renamed
      field there arrives here as an empty string rather than an error. Publishing
      it would create a well-formed DNS record carrying nothing — which resolves
      successfully and verifies nothing, the hardest kind of failure to see.
      Check the resend_dns_records output against Resend's actual response.
    EOT
  }
}
