# Database Migrations

Migrations are applied manually via Supabase SQL Editor or Supabase CLI.

## How to apply

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run each migration file in order (001, 002, ...)
4. Verify tables exist in **Table Editor**

## Migration files

| File | Description |
|------|-------------|
| `001_create_users_table.sql` | Users table with RLS policies |
| `002_create_audit_logs_table.sql` | Audit logs table (append-only) with RLS |
