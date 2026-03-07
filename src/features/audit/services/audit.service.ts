import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditLogEntry } from "@/types/domain";

async function insertAuditLog(
  client: SupabaseClient,
  entry: {
    actor_id: string | null;
    actor_role: "user" | "admin" | "system";
    action: string;
    entity_type: string;
    entity_id: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    const { error } = await client.from("audit_logs").insert(entry);
    if (error) {
      logger.error("Failed to insert audit log", {
        error: error.message,
        action: entry.action,
      });
    }
  } catch (err) {
    logger.error("Audit log insert threw", {
      error: err instanceof Error ? err.message : "unknown",
      action: entry.action,
    });
  }
}

/**
 * Write an audit log entry using the service-role client (bypasses RLS).
 * Failures are caught internally — audit logging never blocks business logic.
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  await insertAuditLog(createAdminClient(), {
    actor_id: entry.actorId,
    actor_role: entry.actorRole,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    metadata: entry.metadata ?? null,
  });
}
