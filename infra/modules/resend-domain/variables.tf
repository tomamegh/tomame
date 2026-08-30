variable "sending_domain" {
  description = <<-EOT
    Fully-qualified domain Resend sends from, e.g. "send.tomame.gh". Resend
    returns the DKIM, SPF and DMARC records that must exist under it before any
    mail is accepted; see the dns_records output.
  EOT
  type        = string
}

variable "region" {
  description = "Resend sending region."
  type        = string
}

variable "api_key_name" {
  description = "Name of the application's restricted API key as it appears in the Resend dashboard."
  type        = string
}

variable "api_key_permission" {
  description = <<-EOT
    Scope of the key the app gets. "sending_access" can only send; "full_access"
    can also read and delete domains and mint further keys.

    Tomame's app only ever sends, so it gets sending_access. A leaked
    full-access key would let an attacker repoint the sending domain and read
    every message the account has sent.
  EOT
  type        = string
  default     = "sending_access"

  validation {
    condition     = contains(["sending_access", "full_access"], var.api_key_permission)
    error_message = "api_key_permission must be \"sending_access\" or \"full_access\"."
  }
}
