import "server-only";

import {
  clearOrderHold,
  getOrderHoldState,
  setOrderHold,
  type OrderHoldRow,
} from "@/db/queries/order-holds";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError } from "@/lib/auth/api-helpers";
import type { PlatformUser } from "@/features/users/types";
import { recordOrderEvent } from "./order-events.service";

/**
 * Holding a parcel, and letting it go again (migration 054).
 *
 * WHY A HOLD AND NOT A STATUS. A status says where the parcel IS; a hold says
 * whether it may move. Adding an eighth status would have meant rewriting
 * `ALLOWED_TRANSITIONS`, every email template, the journey track and the admin
 * console — for a flag. So the hold is three columns on `orders`, and
 * `updateOrderStatusAdmin` refuses to advance an order while `held_at` is set.
 *
 * WHY RELEASING IS ITS OWN ACTION. Advancing a held order must never be the
 * thing that quietly lifts the hold: that would make the guard a speed bump an
 * admin clears by pressing the button they were already pressing. Someone has to
 * decide the objection is settled, and that decision is audited on its own.
 *
 * THE CUSTOMER DOES NOT DO THIS. Nothing in the feedback path reaches these
 * functions — a customer who could halt their own shipment by typing would have
 * a lever worth pulling, and a mis-tap would strand their own box.
 */

export interface HoldOrderInput {
  /**
   * Why. REQUIRED, and the database agrees: `orders_hold_has_reason` refuses a
   * `held_at` with no reason. A parcel that stopped for reasons nobody recorded
   * is a customer asking why with nobody able to answer.
   */
  reason: string;
  /** The objection that prompted it, when there is one. Context, not authority. */
  feedback_id?: string | null;
}

export async function holdOrder(
  admin: PlatformUser,
  orderId: string,
  input: HoldOrderInput,
): Promise<OrderHoldRow> {
  requireAdmin(admin);

  // Trimmed here rather than trusted from the route: a reason of three spaces
  // satisfies "a string was sent" and then fails the column CHECK as a 23514,
  // which reaches the admin as an unreadable Postgres error.
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new APIError(400, "Say why this order is being held");

  const order = await getOrderHoldState(orderId);
  if (!order) throw new APIError(404, "Order not found");
  if (order.held_at) {
    throw new APIError(
      409,
      `This order is already on hold: ${order.hold_reason ?? "no reason recorded"}`,
    );
  }

  const held = await setOrderHold({ orderId, reason, heldBy: admin.id });
  // Null means the guarded update matched nothing — another admin held it
  // between the read above and this write.
  if (!held) throw new APIError(409, "Someone else just put this order on hold. Refresh.");

  await logAuditEvent({
    actorId: admin.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "order_held",
    entityType: AUDIT_ENTITY_TYPES.ORDER_HOLD,
    entityId: orderId,
    metadata: { reason, status: held.status, feedback_id: input.feedback_id ?? null },
  });

  // Internal, not customer-visible. A hold is an operations decision that may be
  // lifted within the hour, and "your parcel has been stopped" with no
  // explanation attached would alarm the customer more than the delay does.
  // `recordOrderEvent` never throws — a lost narrative line cannot fail a hold
  // that is already written, and `audit_logs` still has the fact.
  await recordOrderEvent({
    order_id: orderId,
    kind: "note",
    title: "Order placed on hold",
    detail: reason,
    is_customer_visible: false,
    created_by: admin.id,
  });

  return held;
}

/**
 * Lift the hold. Deliberately separate from advancing the order: this says the
 * objection is settled, and the next status change is its own decision.
 */
export async function releaseOrderHold(
  admin: PlatformUser,
  orderId: string,
  note?: string | null,
): Promise<OrderHoldRow> {
  requireAdmin(admin);

  const order = await getOrderHoldState(orderId);
  if (!order) throw new APIError(404, "Order not found");
  if (!order.held_at) throw new APIError(409, "This order is not on hold");

  const released = await clearOrderHold(orderId);
  if (!released) throw new APIError(409, "Someone else just released this order. Refresh.");

  await logAuditEvent({
    actorId: admin.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "order_hold_released",
    entityType: AUDIT_ENTITY_TYPES.ORDER_HOLD,
    entityId: orderId,
    // The reason the hold WAS placed for, kept here because clearing the columns
    // is the only record that it ever existed.
    metadata: { held_reason: order.hold_reason, note: note?.trim() || null },
  });

  await recordOrderEvent({
    order_id: orderId,
    kind: "note",
    title: "Hold lifted",
    detail: note?.trim() || "The order may move again.",
    is_customer_visible: false,
    created_by: admin.id,
  });

  return released;
}

/**
 * The second lock on the door. `src/proxy.ts` gates the `/api/admin` prefix and
 * the route checks the session, but the one route that trusted those alone
 * shipped live revenue to anonymous callers — so the service checks again.
 *
 * ONE signal, not either. This used to also accept `profile.role === "admin"`,
 * which made the second lock looser than the first: a check that exists because
 * a caller might arrive without the route's gate cannot then assume the caller
 * arrived with it. Accepting the database column as well would let anyone whose
 * `profiles.role` says admin STOP a parcel while lacking the claim
 * `updateOrderStatusAdmin` demands to MOVE one — stopping a customer's shipment
 * requiring less proof than advancing it. `canAccessAdmin` is the single rule
 * (`lib/auth/admin-access.ts`), and it is the rule here too.
 *
 * A local stack with `custom_access_token_hook` commented out therefore cannot
 * hold an order. That is correct: it cannot reach `/admin` either.
 */
function requireAdmin(admin: PlatformUser): void {
  if (!canAccessAdmin(admin)) {
    throw new APIError(403, "Admin access required");
  }
}
