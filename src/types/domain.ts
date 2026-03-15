import type { Role, AuditActorRole, AuditEntityType } from "@/config/constants";

/** User loaded from DB after session validation */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  first_name: string | null;
  last_name: string | null;
}

/** Input shape for writing an audit log */
export interface AuditLogEntry {
  actorId: string | null;
  actorRole: AuditActorRole;
  action: string;
  entityType: AuditEntityType;
  entityId: string | null;
  metadata?: Record<string, unknown>;
}

