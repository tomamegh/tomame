output "record_ids" {
  description = "Created record ids, keyed the same way the resources are."
  value = merge(
    { for key, record in vercel_dns_record.standard : key => record.id },
    { for key, record in vercel_dns_record.mx : key => record.id },
  )
}

output "published" {
  description = <<-EOT
    What was published, as fully-qualified name and type. Read this next to
    `dig` output when a domain will not verify — it is the difference between
    "Terraform did not create the record" and "the record exists but the value
    is wrong", which are very different problems.
  EOT
  value = [
    for record in var.records :
    "${record.name == "" ? var.zone : "${record.name}.${var.zone}"} ${upper(record.type)}"
  ]
}
