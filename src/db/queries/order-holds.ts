import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The three hold columns on `orders` (migration 054).
 *
 * A hold is NOT a status. `ORDER_STATUSES` and `ALLOWED_TRANSITIONS` are
 * untouched: a status says where the parcel IS, a hold says whether it may move.
 * `updateOrderStatusAdmin` refuses every transition while `held_at` is set.
 *
 * Its own file rather than a pair of functions inside `orders.ts` because that
 * module takes a caller-supplied client and is read by customer screens through
 * RLS; these writes are service-role by definition — no customer may hold or
 * release their own parcel, which would be an obvious lever to pull.
 *
 * `db/queries/**` is data access only. Whether the reason is adequate, who may
 * do this and what gets audited all live in `order-hold.service.ts`.
 */

export interface OrderHoldRow {
  id: string;
  user_id: string;
  status: string;
  order_no: string | null;
  held_at: string | null;
  hold_reason: string | null;
  held_by: string | null;
}

const COLUMNS = "id, user_id, status, order_no, held_at, hold_reason, held_by";

export async function getOrderHoldState(orderId: string): Promise<OrderHoldRow | null> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select(COLUMNS)
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the order: ${error.message}`);
  return (data as OrderHoldRow | null) ?? null;
}

/**
 * Put the order on hold, guarded on it not already being held.
 *
 * `.is("held_at", null)` so two admins working the same objection cannot
 * overwrite each other's reason — the second matches nothing and gets null back,
 * which the service turns into a 409 naming the hold that is already in place.
 *
 * `reason` is never optional here: the column CHECK (`orders_hold_has_reason`)
 * refuses a hold without one, and a parcel that stopped for reasons nobody
 * recorded is a customer asking why with no answer available.
 */
export async function setOrderHold(input: {
  orderId: string;
  reason: string;
  heldBy: string;
}): Promise<OrderHoldRow | null> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .update({
      held_at: new Date().toISOString(),
      hold_reason: input.reason,
      held_by: input.heldBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.orderId)
    .is("held_at", null)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to hold the order: ${error.message}`);
  return (data as OrderHoldRow | null) ?? null;
}

/**
 * Lift the hold, guarded on it actually being held.
 *
 * All three columns are cleared together: `orders_hold_has_reason` permits a
 * reason with no `held_at`, but leaving one behind would have the next reader
 * of the row believing a released parcel is still stopped.
 */
export async function clearOrderHold(orderId: string): Promise<OrderHoldRow | null> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .update({
      held_at: null,
      hold_reason: null,
      held_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .not("held_at", "is", null)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to release the order: ${error.message}`);
  return (data as OrderHoldRow | null) ?? null;
}
