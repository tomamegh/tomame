import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * `order_feedback` — what a customer says about a parcel photo (migration 054).
 *
 * The post-purchase lane. `assisted_requests` (049) is the pre-purchase one and
 * `contact_messages` (053) is the signed-out one; this is a customer talking
 * about a parcel we have already bought and are holding at a US hub, and their
 * ownership of that order is the authorization.
 *
 * Service role throughout. 054 gives `authenticated` a SELECT policy and NO
 * insert policy at all — deliberately, even though the words are the customer's
 * own: the route validates, rate-limits and checks ownership before writing, and
 * a direct PostgREST insert would bypass all three and could set `status` or
 * `handled_by` by hand.
 *
 * `db/queries/**` is data access only: no business logic, no auth checks, and
 * errors are thrown rather than swallowed — the customer is told the truth about
 * whether their objection was recorded.
 */

export type OrderFeedbackStatus = "open" | "in_review" | "resolved" | "dismissed";

/**
 * `looks_right` is in this union on purpose. A customer confirming the photo is
 * correct is the single most useful signal the feature produces, and a type that
 * only admitted complaints would throw it away.
 */
export type OrderFeedbackVerdict =
  | "looks_right"
  | "wrong_item"
  | "wrong_variant"
  | "damaged"
  | "other";

export interface OrderFeedbackRow {
  id: string;
  order_id: string;
  photo_id: string | null;
  user_id: string;
  verdict: OrderFeedbackVerdict;
  message: string;
  status: OrderFeedbackStatus;
  handled_by: string | null;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, order_id, photo_id, user_id, verdict, message, status, handled_by, resolution, resolved_at, created_at, updated_at";

export async function insertOrderFeedback(input: {
  orderId: string;
  photoId: string | null;
  userId: string;
  verdict: OrderFeedbackVerdict;
  message: string;
}): Promise<OrderFeedbackRow> {
  const { data, error } = await createAdminClient()
    .from("order_feedback")
    .insert({
      order_id: input.orderId,
      photo_id: input.photoId,
      user_id: input.userId,
      verdict: input.verdict,
      message: input.message,
    })
    .select(COLUMNS)
    .single();

  if (error) throw new Error(`Failed to record your feedback: ${error.message}`);
  return data as OrderFeedbackRow;
}

/**
 * The admin queue. Oldest first — every row is a customer waiting on a parcel
 * that is still cheap to fix, and a queue worked newest-first strands the ones
 * that have been waiting longest.
 */
export async function listOrderFeedback(status?: OrderFeedbackStatus): Promise<OrderFeedbackRow[]> {
  let query = createAdminClient().from("order_feedback").select(COLUMNS);
  if (status) query = query.eq("status", status);

  const { data, error } = await query.order("created_at", { ascending: true }).limit(200);
  if (error) throw new Error(`Failed to load the feedback queue: ${error.message}`);
  return (data ?? []) as OrderFeedbackRow[];
}

export async function getOrderFeedbackById(id: string): Promise<OrderFeedbackRow | null> {
  const { data, error } = await createAdminClient()
    .from("order_feedback")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the feedback: ${error.message}`);
  return (data as OrderFeedbackRow | null) ?? null;
}

/** Everything one order's owner has said about it, newest first. */
export async function listOrderFeedbackForOrder(orderId: string): Promise<OrderFeedbackRow[]> {
  const { data, error } = await createAdminClient()
    .from("order_feedback")
    .select(COLUMNS)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Failed to load the feedback: ${error.message}`);
  return (data ?? []) as OrderFeedbackRow[];
}

/**
 * Move one along, GUARDED on the status the admin saw when they opened the
 * queue — the same discipline `transitionAssistedRequest` (049) and
 * `transitionContactMessage` (053) use.
 *
 * The `.eq("status", from)` is the whole point: two staff opening the queue at
 * the same time cannot both claim the same row, because the second update
 * matches nothing and this returns null for the caller to answer 409 with.
 */
export async function transitionOrderFeedback(input: {
  id: string;
  from: OrderFeedbackStatus;
  to: OrderFeedbackStatus;
  handledBy: string;
  resolution?: string | null;
}): Promise<OrderFeedbackRow | null> {
  const closing = input.to === "resolved" || input.to === "dismissed";

  const { data, error } = await createAdminClient()
    .from("order_feedback")
    .update({
      status: input.to,
      handled_by: input.handledBy,
      ...(closing && { resolved_at: new Date().toISOString() }),
      ...(input.resolution !== undefined && { resolution: input.resolution }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("status", input.from)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to update the feedback: ${error.message}`);
  return (data as OrderFeedbackRow | null) ?? null;
}
