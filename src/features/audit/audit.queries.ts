import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

interface AuditLogInsert {
  actor_id: string | null;
  actor_role: "user" | "admin" | "system";
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Insert an audit log entry.
 * Catches errors — audit logging must never block business logic.
 */
export async function insertAuditLog(
  client: SupabaseClient,
  entry: AuditLogInsert
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
