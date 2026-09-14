import "server-only";

import { logAuditEvent } from "@/features/audit/services/audit.service";
import { formatEtaWindow } from "@/features/journeys/format";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlatformUser } from "@/features/users/types";
import type { Order } from "../types";
import { recordOrderEvent } from "./order-events.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";

/**
 * Setting and adjusting an order's ETA window, outside a status change.
 *
 * WHY THIS EXISTS. Migration 050 made the ETA a WINDOW ("Thu 18 – Sat 20 Sep")
 * because freight does not land on a named day. The only writer of that window
 * was `updateOrderStatusAdmin`, and only on the `processing → in_transit`
 * transition — so an operator who learned on Tuesday that the box had slipped
 * had no way to say so: the transition had already happened and the state
 * machine (correctly) refuses to run it twice. The customer went on reading a
 * date nobody believed any more.
 *
 * Everything the window touches is written here, in one place:
 *  - `orders.eta_from` / `eta_to`, plus `estimated_delivery_date` as the
 *    midpoint, which the deliveries table and the status email still read;
 *  - the same three columns on `order_deliveries`, so the delivery console is
 *    not quietly a day out from the order;
 *  - an `audit_logs` row, because this is an admin mutation of an order;
 *  - a customer-visible `order_events` note, because the person waiting for the
 *    parcel is the reason the window moved.
 */

export interface EtaWindowInput {
  /** ISO `YYYY-MM-DD`. Validated at the route by `etaWindowSchema`. */
  eta_from?: string;
  eta_to?: string;
  /** Clear the window entirely — "we no longer have a date we believe". */
  clear?: boolean;
}

/**
 * Statuses whose window may be edited.
 *
 * Mirrored by `mayEditEtaWindow` in `components/admin-transitions.ts`, which
 * decides whether the CONTROL is drawn. This is the authority: an admin who
 * reaches the endpoint another way still gets refused. Before payment there is
 * nothing to promise; after cancellation there is nobody to promise it to.
 */
const EDITABLE_STATUSES = new Set(["paid", "processing", "in_transit", "delivered", "completed"]);

export async function setOrderEtaWindow(
  admin: PlatformUser,
  orderId: string,
  input: EtaWindowInput,
): Promise<Order> {
  if (!canAccessAdmin(admin)) {
    throw new APIError(403, "Admin access required");
  }

  const db = createAdminClient();
  const { data: existing, error: readError } = await db
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (readError) throw new APIError(500, "Failed to load the order");
  const order = (existing as Order | null) ?? null;
  if (!order) throw new APIError(404, "Order not found");

  if (!EDITABLE_STATUSES.has(order.status)) {
    throw new APIError(
      400,
      `An order that is '${order.status}' has no delivery window to set`,
    );
  }

  const window = input.clear ? CLEARED : resolveWindow(input);
  if (!input.clear && !window.eta_from && !window.eta_to) {
    throw new APIError(400, "Give at least one end of the window");
  }

  const { data: updated, error: writeError } = await db
    .from("orders")
    .update(window)
    .eq("id", orderId)
    .select()
    .single();

  if (writeError || !updated) {
    logger.error("setOrderEtaWindow failed", { orderId, message: writeError?.message });
    throw new APIError(500, "Failed to save the delivery window");
  }

  // `order_deliveries` is upserted rather than updated: an order that shipped
  // before migration 050 added the unique index on `order_id` has no row at all
  // (the upsert failed silently for as long as the table existed), and an admin
  // correcting its window is the natural moment to create one.
  const { error: deliveryError } = await db.from("order_deliveries").upsert(
    {
      order_id: orderId,
      user_id: order.user_id,
      status: deliveryStatusFor(order.status),
      ...window,
    },
    { onConflict: "order_id" },
  );
  if (deliveryError) {
    // The order itself is already correct, which is what the customer's journey
    // screen reads. A stale delivery console row is a smaller harm than telling
    // the admin the save failed when it did not.
    logger.error("eta window not mirrored to order_deliveries", {
      orderId,
      message: deliveryError.message,
    });
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "order_eta_window_set",
    entityType: "order",
    entityId: orderId,
    metadata: {
      from: { eta_from: order.eta_from ?? null, eta_to: order.eta_to ?? null },
      to: { eta_from: window.eta_from, eta_to: window.eta_to },
      estimated_delivery_date: window.estimated_delivery_date,
    },
  });

  // The customer's half of the same fact. `recordOrderEvent` never throws — see
  // its comment — so a lost narrative line cannot fail a window that is saved.
  const spoken = formatEtaWindow({
    from: window.eta_from,
    to: window.eta_to,
    source: "confirmed",
  });
  await recordOrderEvent({
    order_id: orderId,
    order_group_id: order.order_group_id ?? null,
    kind: "note",
    title: spoken ? "Delivery window updated" : "Delivery window removed",
    detail: spoken ?? "We will confirm a new date as soon as we have one.",
    created_by: admin.id,
  });

  return updated as Order;
}

// ── The window, and the single date derived from it ─────────────────────────

interface StoredWindow {
  eta_from: string | null;
  eta_to: string | null;
  /** The midpoint. Still read by the deliveries table and the status email. */
  estimated_delivery_date: string | null;
}

const CLEARED: StoredWindow = {
  eta_from: null,
  eta_to: null,
  estimated_delivery_date: null,
};

/**
 * A window and its midpoint.
 *
 * The same three cases `resolveEtaWindow` in `orders.service.ts` handles, and
 * deliberately the same answers — the two must agree or an order's window would
 * depend on which screen last touched it. A half-open window ("from the 18th, we
 * cannot promise the far end") is stored as given rather than squared off into a
 * range nobody meant.
 *
 * Exported for its test: the midpoint is the one piece of arithmetic here and it
 * rounds DOWN, so an even-length window resolves to the earlier of the two
 * middle days. A customer told "the 18th" for an 18–21 window is disappointed by
 * nothing.
 */
export function resolveWindow(input: EtaWindowInput): StoredWindow {
  const from = input.eta_from?.trim() || null;
  const to = input.eta_to?.trim() || null;

  if (!from && !to) return CLEARED;
  if (!from || !to) {
    const only = from ?? to;
    return { eta_from: from, eta_to: to, estimated_delivery_date: only };
  }

  return { eta_from: from, eta_to: to, estimated_delivery_date: midpoint(from, to) };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function midpoint(from: string, to: string): string {
  const startMs = Date.parse(`${from}T00:00:00Z`);
  const endMs = Date.parse(`${to}T00:00:00Z`);
  // An unparseable end falls back to the start rather than to `Invalid Date`,
  // which would reach the DATE column and answer 22007 from inside the update.
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return from;
  const midMs = startMs + Math.floor((endMs - startMs) / 2 / DAY_MS) * DAY_MS;
  return new Date(midMs).toISOString().slice(0, 10);
}

/**
 * What `order_deliveries.status` should say for an order in this status.
 *
 * 017's vocabulary is its own (`pending | in_transit | out_for_delivery |
 * delivered | failed | returned`) and does not match `orders.status`, so the two
 * are mapped rather than assumed equal. Anything before shipping is `pending`
 * there — the delivery has not started.
 */
function deliveryStatusFor(orderStatus: string): string {
  if (orderStatus === "in_transit") return "in_transit";
  if (orderStatus === "delivered" || orderStatus === "completed") return "delivered";
  return "pending";
}
