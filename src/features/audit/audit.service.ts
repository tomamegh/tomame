import { supabaseAdmin } from "@/lib/supabase/admin";
import { insertAuditLog } from "@/features/audit/audit.queries";
import type { AuditLogEntry } from "@/types/domain";

/**
 * Write an audit log entry using the service-role client (bypasses RLS).
 * Failures are caught internally — audit logging never blocks business logic.
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  await insertAuditLog(supabaseAdmin, {
    actor_id: entry.actorId,
    actor_role: entry.actorRole,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    metadata: entry.metadata ?? null,
  });
}
