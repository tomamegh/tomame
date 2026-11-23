import "server-only";

import { settleStalePendingNotifications } from "@/db/queries/notifications";
import { markNotificationsReviewed } from "@/db/queries/admin-notifications";
import type { NotificationKind } from "../notification-kind";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";

export type PendingDisposition = "shown_in_bell" | "cancelled";

/** Rows younger than this are still in flight and are never settled by hand. */
const SETTLE_OLDER_THAN_HOURS = 24;

/**
 * Fix 13: an admin's recorded decision on notifications that sat pending (the
 * 102 order confirmations that were only ever bell rows). Nothing is sent now:
 * a confirmation weeks late would only confuse the customer. `shown_in_bell`
 * closes them as delivered in the app, `cancelled` as never sent. The decision,
 * who made it and every row id go to the audit log.
 */
export async function settleOldPendingNotifications(adminId: string, disposition: PendingDisposition): Promise<{ settled: number }> {
  const day = new Date().toISOString().slice(0, 10);
  const note =
    disposition === "shown_in_bell"
      ? `Closed ${day}: shown in the customer's bell; not sent by email now (admin decision).`
      : `Cancelled ${day}: never sent; closed so it is not sent late (admin decision).`;
  const ids = await settleStalePendingNotifications(new Date(Date.now() - SETTLE_OLDER_THAN_HOURS * 3_600_000), disposition, note);
  if (ids.length > 0) {
    await logAuditEvent({
      actorId: adminId,
      actorRole: AUDIT_ACTOR_ROLES.ADMIN,
      action: "notifications_settled",
      entityType: AUDIT_ENTITY_TYPES.NOTIFICATION,
      entityId: null,
      metadata: { disposition, count: ids.length, ids },
    });
  }
  return { settled: ids.length };
}

/**
 * Fix 8: an admin marks failed and pending sends reviewed, so "needs
 * attention" counts only what nobody has looked at. Nothing is sent or
 * cancelled; the decision and the row ids go to the audit log.
 */
export async function reviewNotifications(adminId: string, input: { ids?: string[]; kind?: NotificationKind }): Promise<{ reviewed: number }> {
  const ids = await markNotificationsReviewed({ adminId, ids: input.ids, kind: input.kind });
  if (ids.length > 0) {
    await logAuditEvent({
      actorId: adminId,
      actorRole: AUDIT_ACTOR_ROLES.ADMIN,
      action: "notifications_reviewed",
      entityType: AUDIT_ENTITY_TYPES.NOTIFICATION,
      entityId: ids.length === 1 ? ids[0]! : null,
      metadata: { count: ids.length, kind: input.kind ?? "all", ids },
    });
  }
  return { reviewed: ids.length };
}
