import "server-only";

import { getShippedPackageForOrder, updatePackage } from "@/db/queries/warehouse";
import { AUDIT_ENTITY_TYPES } from "@/config/constants";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { logger } from "@/lib/logger";

/**
 * Close a package once nothing in it is still on its way (098).
 *
 * Orders are often delivered one by one — by a rider, an admin, or the customer
 * saying "I've got it" — rather than by moving the whole package. When the last
 * order inside is delivered, the package is too, so the shipments board stops
 * listing a carton that is empty in all but name.
 *
 * NEVER THROWS: it runs after a delivery that has already been committed and
 * emailed, and a board that lags is a smaller harm than a delivery that looks
 * failed. Imports no other warehouse service, so the order service can call it.
 */
export async function closePackageIfAllDelivered(
  orderId: string,
  actor: { id: string; role: "user" | "admin" | "warehouse" | "system" | "driver" },
): Promise<void> {
  try {
    const found = await getShippedPackageForOrder(orderId);
    if (!found || found.pkg.stage === "delivered") return;
    if (!found.orderStatuses.every((s) => s === "delivered" || s === "completed")) return;

    const row = await updatePackage(found.pkg.id, "shipped", {
      stage: "delivered",
      stage_at: new Date().toISOString(),
      stage_by: actor.role === "system" ? null : actor.id,
      notice: null,
      notice_expected_on: null,
      notice_at: null,
    });
    if (!row) return;
    await logAuditEvent({
      actorId: actor.role === "system" ? null : actor.id,
      actorRole: actor.role,
      action: "shipment_stage_moved",
      entityType: AUDIT_ENTITY_TYPES.WAREHOUSE_PACKAGE,
      entityId: row.id,
      metadata: { reference: row.reference, from: found.pkg.stage, to: "delivered", reason: "all_orders_delivered", order_id: orderId },
    });
  } catch (error) {
    logger.warn("package close after delivery failed", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
