output "project_ref" {
  description = "Project reference, the subdomain of the API URL and the id every Supabase CLI command takes."
  value       = supabase_project.this.id
}

output "api_url" {
  description = "Origin the client and server SDKs point at — NEXT_PUBLIC_SUPABASE_URL."
  value       = "https://${supabase_project.this.id}.supabase.co"
}

output "database_host" {
  description = "Direct Postgres host, for migrations and psql."
  value       = "db.${supabase_project.this.id}.supabase.co"
}
