// ── Database row type ─────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_role: "user" | "admin" | "system";
  action: string;
  entity_type: "user" | "payment" | "order" | "job";
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
