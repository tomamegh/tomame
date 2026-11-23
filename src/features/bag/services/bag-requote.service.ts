import "server-only";

import { getCartById } from "@/db/queries/carts";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { APIError } from "@/lib/auth/api-helpers";

import { requoteCart, type RequoteResult } from "./bag.service";

/**
 * Fix 14: an admin re-quotes one open bag at today's rate. Without `apply` it
 * only previews the snapshot total, the new total and the difference; with
 * `apply` it stores the new quotes (each line's 24-hour clock restarts) and
 * writes the audit row. Nothing is sent to the customer.
 */
export async function adminRequoteBag(adminId: string, cartId: string, apply: boolean): Promise<RequoteResult> {
  const cart = await getCartById(cartId);
  if (!cart) throw new APIError(404, "That bag no longer exists");
  if (cart.status !== "open") throw new APIError(409, "Only an open bag can be re-quoted");
  const result = await requoteCart(cart, apply);
  if (apply) {
    await logAuditEvent({
      actorId: adminId,
      actorRole: AUDIT_ACTOR_ROLES.ADMIN,
      action: "bag_requoted",
      entityType: AUDIT_ENTITY_TYPES.CART,
      entityId: cart.id,
      metadata: {
        snapshot_total_ghs: result.snapshot_total_ghs,
        new_total_ghs: result.new_total_ghs,
        diff_ghs: result.diff_ghs,
        unpriced_count: result.unpriced_count,
        lines: result.lines.map((l) => ({ id: l.id, from: l.snapshot_total_ghs, to: l.new_total_ghs })),
      },
    });
  }
  return result;
}
