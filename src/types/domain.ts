import type { Role, AuditActorRole, AuditEntityType } from "@/config/constants";

/** User loaded from DB after session validation */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
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

/**
 * Generic service result — all service functions return this.
 * Eliminates thrown-exception coupling between service and route handler.
 */
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; status: number };
