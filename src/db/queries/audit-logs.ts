import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** An `audit_logs` row as the background readers need it. */
export interface AuditLogRow {
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Rows for `actions` written at or after `since`, oldest first (uses idx_audit_logs_created, 082). */
export async function listAuditLogsSince(actions: readonly string[], since: string, limit = 2000): Promise<AuditLogRow[]> {
  const { data, error } = await createAdminClient()
    .from("audit_logs")
    .select("entity_type, entity_id, action, metadata, created_at")
    .in("action", actions)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to read audit logs: ${error.message}`);
  return (data ?? []) as AuditLogRow[];
}
