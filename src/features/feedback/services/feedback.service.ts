import "server-only";

import {
  insertOrderFeedback,
  listOrderFeedback,
  listOrderFeedbackForOrder,
  transitionOrderFeedback,
  type OrderFeedbackRow,
  type OrderFeedbackStatus,
  type OrderFeedbackVerdict,
} from "@/db/queries/order-feedback";
import { getOrderPhoto } from "@/db/queries/order-photos";
import { getOrderOwner } from "@/db/queries/orders";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { APIError } from "@/lib/auth/api-helpers";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlatformUser } from "@/features/users/types";
import type { SubmitOrderFeedbackInput, TransitionOrderFeedbackInput } from "../schema";
import type { OrderFeedback } from "../types";

/**
 * "That is not what I ordered" — the customer's half of migration 054.
 *
 * The parcel is photographed at a US hub, which is the first moment a customer
 * sees what was actually BOUGHT rather than what they asked for, and therefore
 * the first moment a mistake can be caught while it is still cheap to fix.
 *
 * FEEDBACK NEVER PAUSES ANYTHING. Kelvin's decision: an admin decides per case.
 * Nothing in this file writes `orders.held_at` — if typing a complaint stopped
 * the parcel, halting your own shipment would be a lever anyone could pull, and
 * a customer who simply mis-tapped would strand their own box. The hold is a
 * separate, audited admin action (`order-hold.service.ts`) and the queue below
 * is where an admin decides to take it.
 */

/** The words we put in a customer's mouth when they had nothing to add. */
const IMPLIED_MESSAGE: Partial<Record<OrderFeedbackVerdict, string>> = {
  looks_right: "Looks right to me.",
};

/**
 * Record what the customer says about their parcel.
 *
 * Authorised by OWNERSHIP OF THE ORDER, never by role and never by the
 * `photo_id` in the body — a photo id is a bare uuid the browser sends, and
 * trusting it would let anyone holding one attach words to a stranger's parcel.
 * An order belonging to someone else answers 404, the same shape the rest of the
 * orders API uses, so the endpoint cannot be walked to discover which ids exist.
 *
 * An admin is not exempt: `user_id` on this table means "the customer who said
 * it", and an admin's note about a parcel is a `resolution` or an order event,
 * not a customer complaint.
 */
export async function submitOrderFeedback(
  user: PlatformUser,
  orderId: string,
  input: SubmitOrderFeedbackInput,
): Promise<OrderFeedback> {
  const order = await getOrderOwner(createAdminClient(), orderId);
  if (!order || order.user_id !== user.id) {
    throw new APIError(404, "Order not found");
  }

  const message = resolveMessage(input);
  const photoId = await resolvePhotoId(orderId, input.photo_id ?? null);

  const row = await insertOrderFeedback({
    orderId,
    photoId,
    userId: user.id,
    verdict: input.verdict,
    message,
  });

  // Audited because a person is now on the hook for it, and because "when did
  // the customer first say this?" is the first question asked of a parcel that
  // shipped wrong anyway.
  await logAuditEvent({
    actorId: user.id,
    actorRole: AUDIT_ACTOR_ROLES.USER,
    action: "order_feedback_submitted",
    entityType: AUDIT_ENTITY_TYPES.ORDER_FEEDBACK,
    entityId: row.id,
    metadata: { order_id: orderId, verdict: input.verdict, photo_id: row.photo_id },
  });

  return toOrderFeedback(row);
}

/**
 * The message that reaches the column, given a verdict.
 *
 * `looks_right` may arrive with nothing typed — that is the confirmation tap,
 * and demanding a sentence for it would lose the signal. Every other verdict is
 * a complaint somebody has to act on, and "wrong_item" with no words tells an
 * admin nothing they can work with.
 */
function resolveMessage(input: SubmitOrderFeedbackInput): string {
  const typed = input.message?.trim();
  if (typed) return typed;

  const implied = IMPLIED_MESSAGE[input.verdict];
  if (implied) return implied;

  throw new APIError(400, "Tell us what is wrong with it");
}

/**
 * The photo this complaint is about — but only if it is a photo of THIS parcel.
 *
 * `photo_id` is a bare uuid the browser sends. Ownership of the ORDER is what
 * authorises the write, and that check says nothing about the photo: without
 * this, a customer can file a complaint against their own order while pointing
 * it at a photograph of somebody else's, and the admin queue then shows the
 * wrong parcel beside the words — on the one screen where a person decides
 * whether to stop a box. Migration 054 pins `order_photos.storage_path` to its
 * own order for the same reason; this is the same rule one table over.
 *
 * An unknown or foreign id is dropped rather than refused: the complaint itself
 * is real and losing it over a stale reference would be the worse failure.
 */
async function resolvePhotoId(orderId: string, photoId: string | null): Promise<string | null> {
  if (!photoId) return null;
  const photo = await getOrderPhoto(photoId);
  return photo && photo.order_id === orderId ? photo.id : null;
}

/**
 * What this customer has already said about this order, and what came back.
 *
 * Same ownership rule as the submit. Admins may read it too — the admin order
 * screen renders the same list — and the service role is used for both, so the
 * check here is the only thing standing between a caller and someone else's
 * words.
 */
export async function listCustomerOrderFeedback(
  user: PlatformUser,
  orderId: string,
): Promise<OrderFeedback[]> {
  const order = await getOrderOwner(createAdminClient(), orderId);
  if (!order) throw new APIError(404, "Order not found");
  // `canAccessAdmin` and NOT `user.profile.role`. The role claim on the JWT is
  // the one rule every other admin surface reads (`lib/auth/admin-access.ts`),
  // and the database column is a different answer to the same question: the two
  // part company wherever `custom_access_token_hook` has not run, and
  // `profiles.role` is the column behind the privilege escalation closed earlier
  // in this release. Two spellings of this rule drifted into the `@tomame.ca`
  // backdoor once already; there is one spelling.
  if (!canAccessAdmin(user) && order.user_id !== user.id) {
    throw new APIError(404, "Order not found");
  }

  const rows = await listOrderFeedbackForOrder(orderId);
  return rows.map(toOrderFeedback);
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function listOrderFeedbackQueue(
  status?: OrderFeedbackStatus,
): Promise<OrderFeedbackRow[]> {
  return listOrderFeedback(status);
}

/**
 * Claim or close one objection.
 *
 * `from` is the status the admin saw when they opened the queue, so two of them
 * acting at once cannot both take the same customer: the second gets a 409
 * rather than silently overwriting the first's resolution. The guard is a
 * `WHERE status = from` in the UPDATE, not a read-then-write, so it holds
 * against two requests in flight simultaneously.
 */
export async function moveOrderFeedback(
  adminId: string,
  id: string,
  input: TransitionOrderFeedbackInput,
): Promise<OrderFeedbackRow> {
  const row = await transitionOrderFeedback({
    id,
    from: input.from,
    to: input.status,
    handledBy: adminId,
    resolution: input.resolution,
  });
  if (!row) throw new APIError(409, "Someone else already picked this one up. Refresh the queue.");

  // This is a state change on someone's order, so it is audited — with the
  // order id in the metadata, because the entity here is the feedback row and
  // "which parcel was this about?" is otherwise a second query.
  await logAuditEvent({
    actorId: adminId,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "order_feedback_updated",
    entityType: AUDIT_ENTITY_TYPES.ORDER_FEEDBACK,
    entityId: id,
    metadata: { order_id: row.order_id, from: input.from, to: input.status },
  });

  return row;
}

function toOrderFeedback(row: OrderFeedbackRow): OrderFeedback {
  return {
    id: row.id,
    order_id: row.order_id,
    photo_id: row.photo_id,
    verdict: row.verdict,
    message: row.message,
    status: row.status,
    resolution: row.resolution,
    resolved_at: row.resolved_at,
    created_at: row.created_at,
  };
}
