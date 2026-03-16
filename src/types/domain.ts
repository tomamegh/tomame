import type { AuditActorRole, AuditEntityType } from "@/config/constants";


/** Input shape for writing an audit log */
export interface AuditLogEntry {
  actorId: string | null;
  actorRole: AuditActorRole;
  action: string;
  entityType: AuditEntityType;
  entityId: string | null;
  metadata?: Record<string, unknown>;
}

