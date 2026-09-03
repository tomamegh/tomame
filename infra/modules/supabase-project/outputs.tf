output "project_ref" {
  description = "Project reference, the subdomain of the API URL and the id every Supabase CLI command takes."
  value       = supabase_project.this.id
}

output "api_url" {
  description = "Origin the client and server SDKs point at — NEXT_PUBLIC_SUPABASE_URL."
  value       = "https://${supabase_project.this.id}.supabase.co"
}

output "publishable_key" {
  description = <<-EOT
    The browser-safe key — NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Safe to ship to
    a client because every table it reaches is behind RLS. Marked sensitive
    anyway so it is not printed by an unrelated `terraform output`.
  EOT
  value       = data.supabase_apikeys.this.publishable_key
  sensitive   = true
}

output "service_role_key" {
  description = <<-EOT
    SUPABASE_SECRET_KEY — bypasses RLS entirely. It belongs only in server-side
    code (src/lib/supabase/admin.ts) and must never reach a NEXT_PUBLIC_* name;
    anything prefixed NEXT_PUBLIC_ is inlined into the client bundle at build
    time, which would publish a key that can read and write every customer's
    orders.
  EOT
  value       = data.supabase_apikeys.this.service_role_key
  sensitive   = true
}

output "database_host" {
  description = "Direct Postgres host, for migrations and psql."
  value       = "db.${supabase_project.this.id}.supabase.co"
}
