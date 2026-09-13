import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  insertOrderEvent,
  listOrderEvents,
  listOrderEventsForOrders,
  type OrderEventInsert,
  type OrderEventKind,
  type OrderEventRow,
} from "@/db/queries/order-events";
import { getOrderOwner } from "@/db/queries/orders";
import { createAdminClient } from "@/lib/supabase/admin";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import type { PlatformUser } from "@/features/users/types";

/**
 * `order_events` — the customer narrative of a journey (migration 050).
 *
 * `audit_logs` remains the compliance record and is written exactly as before;
 * this is the second, human-worded log the customer actually reads. The two are
 * written side by side in `updateOrderStatusAdmin` and neither replaces the other.
 */

// ── Writing ─────────────────────────────────────────────────────────────────

/**
 * Customer wording for each status the machine can move an order into.
 *
 * `paid` is absent on purpose: the payment path writes its own
 * `payment_received` event, which can name the channel ("MTN MoMo") — something
 * a status transition knows nothing about.
 */
const STATUS_EVENTS: Record<string, { kind: OrderEventKind; title: string }> = {
  processing: { kind: "purchased", title: "Our buyer is placing the order" },
  in_transit: { kind: "departed", title: "On its way to Accra" },
  delivered: { kind: "delivered", title: "Delivered to you" },
  completed: { kind: "completed", title: "Journey complete" },
  cancelled: { kind: "cancelled", title: "Order cancelled" },
};

/** Whether a status transition has a customer-facing sentence at all. */
export function eventForStatus(status: string): { kind: OrderEventKind; title: string } | null {
  return Object.hasOwn(STATUS_EVENTS, status) ? STATUS_EVENTS[status]! : null;
}

/**
 * Record one event. Service-role by construction — RLS grants `authenticated`
 * no INSERT on this table, so a customer can never write their own history.
 *
 * NEVER THROWS. This is deliberate and the reason it exists as its own function:
 * it is called alongside a status change that has already been committed to the
 * database and already emailed the customer. Failing the request at that point
 * would leave the caller believing the transition did not happen, and a retry
 * would be rejected by the state machine as an illegal transition. A lost
 * narrative line is a smaller harm than a status change that looks failed but is
 * not, so a failure is logged and swallowed. `audit_logs` still has the fact.
 */
export async function recordOrderEvent(input: OrderEventInsert): Promise<OrderEventRow | null> {
  try {
    return await insertOrderEvent(createAdminClient(), input);
  } catch (error: unknown) {
    logger.error("order event not recorded", {
      orderId: input.order_id,
      kind: input.kind,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * One order's customer-visible events, for the owner (or an admin).
 *
 * Ownership is established HERE, against the order, before any event is read —
 * the same 404-for-someone-else's-order shape the rest of `orders.service.ts`
 * uses, so the endpoint cannot be used to probe which order ids exist.
 *
 * Reads go through the service role after that check, not through the caller's
 * cookie, because the detail screen also renders for an admin looking at someone
 * else's order; `customerVisibleOnly` is applied in SQL either way, so an
 * internal note never reaches this function's output.
 */
export async function listCustomerOrderEvents(
  user: PlatformUser,
  orderId: string,
): Promise<OrderEventRow[]> {
  const admin = createAdminClient();
  const order = await getOrderOwner(admin, orderId);
  if (!order) throw new APIError(404, "Order not found");
  if (user.profile.role !== "admin" && order.user_id !== user.id) {
    throw new APIError(404, "Order not found");
  }

  return listOrderEvents(admin, orderId, { customerVisibleOnly: true });
}

/**
 * Customer-visible events for a set of orders, keyed by order id.
 *
 * The Journeys list asks "has this one reached the hub?" of every row at once;
 * one query answers it for all of them. The caller must have already scoped the
 * order ids to the viewer — this function trusts the ids it is given, which is
 * why it is not exported through an HTTP route of its own.
 */
export async function mapCustomerOrderEvents(
  client: SupabaseClient,
  orderIds: readonly string[],
): Promise<Map<string, OrderEventRow[]>> {
  const rows = await listOrderEventsForOrders(client, orderIds, {
    customerVisibleOnly: true,
  });

  const byOrder = new Map<string, OrderEventRow[]>();
  for (const row of rows) {
    const list = byOrder.get(row.order_id);
    if (list) list.push(row);
    else byOrder.set(row.order_id, [row]);
  }
  return byOrder;
}
