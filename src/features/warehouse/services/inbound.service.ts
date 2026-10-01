import "server-only";

import {
  countInboundByStatus,
  deleteExpectedInboundParcel,
  deleteInboundLink,
  findInboundParcelByKeys,
  getInboundParcel,
  insertInboundLink,
  insertInboundParcel,
  listInboundLinks,
  listInboundParcels,
  updateInboundParcel,
  type InboundParcelRow,
} from "@/db/queries/inbound-parcels";
import { getProfileNames } from "@/db/queries/warehouse";
import { AUDIT_ENTITY_TYPES } from "@/config/constants";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import type { PlatformUser } from "@/features/users/types";
import { APIError } from "@/lib/auth/api-helpers";
import { requireWarehouse, warehouseActorRole } from "@/lib/auth/guards";

import {
  CARRIER_LABELS,
  formatTracking,
  normaliseTracking,
  type InboundCarrier,
} from "../inbound/tracking-number";
import {
  INBOUND_LATE_DAYS,
  type InboundCounts,
  type InboundOrderRef,
  type InboundParcel,
  type InboundStatus,
  type WarehouseItem,
} from "../types";
import type { ReceiveItemInput, RegisterInboundInput, UnmatchedInboundInput } from "../schema";
import { listWarehouseItemsByIds, receiveWarehouseItem } from "./warehouse.service";

/**
 * Inbound parcels (086): the store's tracking number, linked to the Tomame
 * orders inside the box.
 *
 * THE LIFE OF A PARCEL.
 *  1. An admin buys the item and pastes the store's tracking number onto the
 *     order (`registerInboundTracking`). The parcel is `expected`.
 *  2. It lands. The operator scans the carrier barcode; the lookup finds the
 *     parcel and opens it with its orders. One tap (`receiveInboundParcel`)
 *     marks it `arrived` and logs every order in through the bench's own
 *     receive, which writes the customer's "At our US hub" event and weight.
 *  3. A barcode nobody registered is either linked to an order on the spot
 *     (which registers it), or logged as `unmatched` and chased from the list.
 *
 * Every mutation is audited as a `warehouse_inbound_*` action on the parcel.
 * 082's feed merges `warehouse_*` audit rows into the admin's warehouse
 * timeline, which is where these surface; scans go to `warehouse_activity`
 * through the lookup, like every other scan. A link or receive is a state
 * change, so it belongs in `audit_logs` and not in the read trail (082).
 */

const BENCH_STATUSES = ["paid", "processing"];
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Reads ───────────────────────────────────────────────────────────────────

export async function getInboundParcelView(user: PlatformUser, id: string): Promise<InboundParcel> {
  requireWarehouse(user);
  const row = await getInboundParcel(id);
  if (!row) throw new APIError(404, "Parcel not found");
  const [view] = await hydrate(user, [row]);
  return view!;
}

export async function listInboundParcelViews(
  user: PlatformUser,
  status: InboundStatus,
  limit = 200,
): Promise<InboundParcel[]> {
  requireWarehouse(user);
  // Expected parcels are worked oldest first: the one at the top is the one to chase.
  const rows = await listInboundParcels({ statuses: [status], limit, oldestFirst: status === "expected" });
  return hydrate(user, rows);
}

export async function listInboundForOrder(user: PlatformUser, orderId: string): Promise<InboundParcel[]> {
  requireWarehouse(user);
  const links = await listInboundLinks({ orderIds: [orderId] });
  const rows = await listInboundParcels({ ids: links.map((l) => l.parcel_id) });
  return hydrate(user, rows);
}

/** The parcel any of these candidate keys names, if one exists. */
export async function findInboundParcelId(user: PlatformUser, keys: string[]): Promise<string | null> {
  requireWarehouse(user);
  return (await findInboundParcelByKeys(keys))?.id ?? null;
}

export async function getInboundCounts(user: PlatformUser): Promise<InboundCounts> {
  requireWarehouse(user);
  const [counts, expected] = await Promise.all([
    countInboundByStatus(),
    listInboundParcels({ statuses: ["expected"], limit: 500, oldestFirst: true }),
  ]);
  const cutoff = Date.now() - INBOUND_LATE_DAYS * DAY_MS;
  return {
    ...counts,
    late: expected.filter((p) => Date.parse(p.created_at) < cutoff).length,
  };
}

// ── Writes ──────────────────────────────────────────────────────────────────

/**
 * Put a store's tracking number on an order. If the number is already known
 * (a second order in the same box, or a parcel that was logged as unmatched),
 * the order is linked to that parcel instead of creating a second one.
 */
export async function registerInboundTracking(
  user: PlatformUser,
  input: RegisterInboundInput,
): Promise<InboundParcel> {
  requireWarehouse(user);
  const tracking = normaliseTracking(input.tracking_number);
  if (!tracking) throw new APIError(400, "That does not look like a tracking number.");
  const [item] = await listWarehouseItemsByIds(user, [input.order_id]);
  if (!item) throw new APIError(404, "Order not found");
  assertLinkable(item);

  const existing = await findInboundParcelByKeys(tracking.candidates);
  if (existing) return linkOrder(user, existing, item);

  const { row, conflict } = await insertInboundParcel({
    tracking_number: formatTracking(tracking.key),
    tracking_key: tracking.key,
    carrier: tracking.carrier,
    status: "expected",
    source: "registered",
    store_order_ref: input.store_order_ref?.trim() || null,
    note: input.note?.trim() || null,
    registered_by: user.id,
  });
  if (conflict || !row) {
    // Somebody registered the same number a moment ago: join their parcel.
    const raced = await findInboundParcelByKeys([tracking.key]);
    if (!raced) throw new APIError(409, "Someone else just changed this parcel. Try again.");
    return linkOrder(user, raced, item);
  }
  await insertInboundLink({ parcel_id: row.id, order_id: item.order_id, linked_by: user.id });
  await audit(user, "warehouse_inbound_registered", row, {
    order_id: item.order_id,
    order_no: item.order_no,
    store_order_ref: row.store_order_ref,
  });
  return getInboundParcelView(user, row.id);
}

export async function linkInboundOrder(
  user: PlatformUser,
  parcelId: string,
  orderId: string,
): Promise<InboundParcel> {
  requireWarehouse(user);
  const parcel = await getInboundParcel(parcelId);
  if (!parcel) throw new APIError(404, "Parcel not found");
  const [item] = await listWarehouseItemsByIds(user, [orderId]);
  if (!item) throw new APIError(404, "Order not found");
  assertLinkable(item);
  return linkOrder(user, parcel, item);
}

/**
 * Take an order off a parcel (a wrong link). A parcel that never arrived and
 * now belongs to nobody is removed — it was only ever a note that something was
 * coming. One that is physically here becomes `unmatched`, so it is not lost.
 */
export async function unlinkInboundOrder(
  user: PlatformUser,
  parcelId: string,
  orderId: string,
): Promise<InboundParcel | null> {
  requireWarehouse(user);
  const parcel = await getInboundParcel(parcelId);
  if (!parcel) throw new APIError(404, "Parcel not found");
  const removed = await deleteInboundLink(parcelId, orderId);
  if (!removed) throw new APIError(404, "That order is not on this parcel");

  const remaining = await listInboundLinks({ parcelIds: [parcelId] });
  let outcome: "kept" | "deleted" | "unmatched" = "kept";
  if (remaining.length === 0) {
    if (parcel.status === "expected") {
      outcome = (await deleteExpectedInboundParcel(parcelId)) ? "deleted" : "kept";
    } else if (parcel.status === "arrived") {
      outcome = (await updateInboundParcel(parcelId, "arrived", { status: "unmatched" })) ? "unmatched" : "kept";
    }
  }
  await audit(user, "warehouse_inbound_unlinked", parcel, { order_id: orderId, outcome });
  return outcome === "deleted" ? null : getInboundParcelView(user, parcelId);
}

/** A parcel that is here and belongs to no order we know of. */
export async function logUnmatchedParcel(
  user: PlatformUser,
  input: UnmatchedInboundInput,
): Promise<InboundParcel> {
  requireWarehouse(user);
  const tracking = normaliseTracking(input.tracking_number);
  if (!tracking) throw new APIError(400, "That does not look like a tracking number.");

  // Logged twice, or registered while the operator was deciding: open that one.
  const existing = await findInboundParcelByKeys(tracking.candidates);
  if (existing) return getInboundParcelView(user, existing.id);

  const now = new Date().toISOString();
  const { row, conflict } = await insertInboundParcel({
    tracking_number: formatTracking(tracking.key),
    tracking_key: tracking.key,
    carrier: tracking.carrier,
    status: "unmatched",
    source: "scanned",
    note: input.note?.trim() || null,
    registered_by: user.id,
    arrived_at: now,
    arrived_by: user.id,
  });
  if (conflict || !row) {
    const raced = await findInboundParcelByKeys([tracking.key]);
    if (!raced) throw new APIError(409, "Someone else just changed this parcel. Try again.");
    return getInboundParcelView(user, raced.id);
  }
  await audit(user, "warehouse_inbound_unmatched_logged", row, { note: row.note });
  return getInboundParcelView(user, row.id);
}

/**
 * The one tap after a scan: the parcel is here. Marks it `arrived` and logs
 * each of its orders in through the bench's receive — the same customer event,
 * the same audit row, the same `paid → processing` move. The scale's weight
 * goes on the order only when the parcel holds exactly one; a box of three
 * orders weighs all three, which is no order's weight.
 *
 * Idempotent: receiving a parcel twice re-runs the bench receive, which writes
 * nothing new without a new weight.
 */
export async function receiveInboundParcel(
  user: PlatformUser,
  parcelId: string,
  input: ReceiveItemInput,
): Promise<{ parcel: InboundParcel; received: string[]; skipped: Array<{ order_no: string; reason: string }> }> {
  requireWarehouse(user);
  const parcel = await getInboundParcel(parcelId);
  if (!parcel) throw new APIError(404, "Parcel not found");
  const links = await listInboundLinks({ parcelIds: [parcelId] });
  if (links.length === 0) throw new APIError(409, "Link this parcel to an order before logging it in.");

  if (parcel.status !== "arrived") {
    const moved = await updateInboundParcel(parcelId, parcel.status, {
      status: "arrived",
      arrived_at: parcel.arrived_at ?? new Date().toISOString(),
      arrived_by: parcel.arrived_by ?? user.id,
    });
    if (!moved) throw new APIError(409, "Someone else just changed this parcel. Refresh and try again.");
    await audit(user, "warehouse_inbound_arrived", moved, {
      order_ids: links.map((l) => l.order_id),
      weight_lbs: input.weight_lbs ?? null,
    });
  }

  const items = await listWarehouseItemsByIds(user, links.map((l) => l.order_id));
  const single = items.length === 1;
  const received: string[] = [];
  const skipped: Array<{ order_no: string; reason: string }> = [];
  for (const item of items) {
    if (!BENCH_STATUSES.includes(item.order_status)) {
      skipped.push({ order_no: item.order_no, reason: `It is ${item.order_status.replace(/_/g, " ")}` });
      continue;
    }
    try {
      await receiveWarehouseItem(user, item.order_id, {
        weight_lbs: single ? (input.weight_lbs ?? null) : null,
        location: input.location ?? null,
        note: input.note ?? null,
      });
      received.push(item.order_no);
    } catch (error) {
      skipped.push({
        order_no: item.order_no,
        reason: error instanceof APIError ? error.message : "Could not log it in",
      });
    }
  }
  return { parcel: await getInboundParcelView(user, parcelId), received, skipped };
}

// ── Internals ───────────────────────────────────────────────────────────────

/** Only an order the hub is still waiting on can gain a parcel. */
function assertLinkable(item: WarehouseItem): void {
  if (!BENCH_STATUSES.includes(item.order_status)) {
    throw new APIError(
      409,
      `${item.order_no} is ${item.order_status.replace(/_/g, " ")} and is not expected at the hub.`,
    );
  }
}

async function linkOrder(
  user: PlatformUser,
  parcel: InboundParcelRow,
  item: WarehouseItem,
): Promise<InboundParcel> {
  const { created } = await insertInboundLink({
    parcel_id: parcel.id,
    order_id: item.order_id,
    linked_by: user.id,
  });
  // An unmatched parcel that now has an owner is simply an arrived one.
  if (parcel.status === "unmatched") {
    await updateInboundParcel(parcel.id, "unmatched", { status: "arrived" });
  }
  if (created) {
    await audit(user, "warehouse_inbound_linked", parcel, {
      order_id: item.order_id,
      order_no: item.order_no,
      was: parcel.status,
    });
  }
  return getInboundParcelView(user, parcel.id);
}

async function audit(
  user: PlatformUser,
  action: string,
  parcel: Pick<InboundParcelRow, "id" | "tracking_key" | "status">,
  metadata: Record<string, unknown>,
): Promise<void> {
  await logAuditEvent({
    actorId: user.id,
    actorRole: warehouseActorRole(user),
    action,
    entityType: AUDIT_ENTITY_TYPES.INBOUND_PARCEL,
    entityId: parcel.id,
    metadata: { tracking_key: parcel.tracking_key, status: parcel.status, ...metadata },
  });
}

async function hydrate(user: PlatformUser, rows: InboundParcelRow[]): Promise<InboundParcel[]> {
  if (rows.length === 0) return [];
  const links = await listInboundLinks({ parcelIds: rows.map((r) => r.id) });
  const [items, names] = await Promise.all([
    listWarehouseItemsByIds(user, links.map((l) => l.order_id)),
    getProfileNames(
      [...new Set(rows.flatMap((r) => [r.registered_by, r.arrived_by]).filter((x): x is string => !!x))],
    ),
  ]);
  const byOrder = new Map(items.map((i) => [i.order_id, toOrderRef(i)]));
  const now = Date.now();

  return rows.map((row) => {
    const orders = links
      .filter((l) => l.parcel_id === row.id)
      .map((l) => byOrder.get(l.order_id))
      .filter((o): o is InboundOrderRef => !!o);
    const since = row.status === "expected" ? row.created_at : (row.arrived_at ?? row.created_at);
    const carrier = (row.carrier ?? "other") as InboundCarrier;
    return {
      id: row.id,
      tracking_key: row.tracking_key,
      tracking_display: row.tracking_number,
      carrier: row.carrier,
      carrier_label: CARRIER_LABELS[carrier] ?? "Carrier",
      status: row.status,
      source: row.source,
      store_order_ref: row.store_order_ref,
      note: row.note,
      orders,
      registered_by_name: row.registered_by ? (names.get(row.registered_by) ?? null) : null,
      arrived_at: row.arrived_at,
      arrived_by_name: row.arrived_by ? (names.get(row.arrived_by) ?? null) : null,
      created_at: row.created_at,
      age_days: Math.max(0, Math.floor((now - Date.parse(since)) / DAY_MS)),
    };
  });
}

export function toOrderRef(item: WarehouseItem): InboundOrderRef {
  return {
    order_id: item.order_id,
    order_no: item.order_no,
    title: item.title,
    image_url: item.image_url,
    store: item.store,
    first_name: firstName(item.recipient.name),
    stage: item.stage,
    order_status: item.order_status,
    received_at: item.received?.at ?? null,
    held: !!item.held,
  };
}

export function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}
