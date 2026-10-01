import "server-only";

import {
  countPackagesByStatus,
  deletePackageItem,
  deletePackingPackage,
  getPackageById,
  getPackageByReference,
  getProfileNames,
  getWarehouseAddress,
  getWarehouseOrderByNo,
  insertPackage,
  insertPackageItems,
  listBoxRefs,
  listGroupDeliverySnapshots,
  listHubArrivals,
  listItemsForOrders,
  listOpenFeedbackOrderIds,
  listPackageItems,
  listPackages,
  listPhotoIdsByOrder,
  listRecipientProfiles,
  listWarehouseOrders,
  updatePackage,
  type PackageItemRow,
  type PackagePatch,
  type PackageRow,
  type PackageStatus,
  type WarehouseOrderRow,
} from "@/db/queries/warehouse";
import { findInboundParcelByKeys } from "@/db/queries/inbound-parcels";
import { listOrderFeedback, type OrderFeedbackStatus } from "@/db/queries/order-feedback";
import { AUDIT_ENTITY_TYPES, WAREHOUSE_ACTIVITY_KINDS } from "@/config/constants";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { findStore } from "@/features/extraction/stores";
import { recordOrderEvent } from "@/features/orders/services/order-events.service";
import { advanceOrderFromWarehouse } from "@/features/orders/services/orders.service";
import type { PlatformUser } from "@/features/users/types";
import { APIError } from "@/lib/auth/api-helpers";
import { requireWarehouse, warehouseActorRole } from "@/lib/auth/guards";
import { logger } from "@/lib/logger";

import { normaliseTracking } from "../inbound/tracking-number";
import { recordWarehouseActivity } from "./activity.service";

import type {
  ItemStage,
  LookupResult,
  WarehouseDashboard,
  WarehouseIssue,
  WarehouseItem,
  WarehousePackage,
  WarehouseRecipient,
  WarehouseReturnAddress,
} from "../types";
import type {
  AddPackageItemsInput,
  CreatePackageInput,
  ReceiveItemInput,
  ShipPackageInput,
  UpdatePackageInput,
} from "../schema";

/**
 * The packaging platform (081): business rules for receiving, packing, sealing,
 * labelling and shipping.
 *
 * Every export checks `requireWarehouse` itself — the proxy gates the prefix and
 * the route checks the session, and this is the third lock, for the reason
 * `order-hold.service.ts` gives: the one route that trusted the others alone
 * leaked. Every mutation writes `audit_logs`, with the actor audited as what
 * they are (`warehouse` or `admin`).
 *
 * THE BENCH. Items the hub handles are orders in `paid` or `processing`. An order
 * moves `paid → processing` when it is logged in (it has physically arrived, so
 * it was bought), and `processing → in_transit` when its package ships. Those are
 * the only two moves the warehouse makes; see `advanceOrderFromWarehouse`.
 */

const BENCH_STATUSES = ["paid", "processing"];
/** How many photo ids an item carries to the browser — thumbnails, not a gallery. */
const PHOTO_PREVIEW_LIMIT = 6;

// ── Items ───────────────────────────────────────────────────────────────────

/** The bench: everything paid for and not yet gone, plus what is in open packages. */
export async function listWarehouseItems(
  user: PlatformUser,
  filters: { stage?: ItemStage } = {},
): Promise<WarehouseItem[]> {
  requireWarehouse(user);
  const orders = await listWarehouseOrders({ statuses: BENCH_STATUSES, limit: 500 });
  const items = await hydrateItems(orders);
  return filters.stage ? items.filter((i) => i.stage === filters.stage) : items;
}

export async function getWarehouseItem(user: PlatformUser, orderId: string): Promise<WarehouseItem> {
  requireWarehouse(user);
  const [order] = await listWarehouseOrders({ ids: [orderId] });
  if (!order) throw new APIError(404, "Item not found");
  const [item] = await hydrateItems([order]);
  if (!item) throw new APIError(404, "Item not found");
  return item;
}

/** Several items by order id, in any stage — for screens that start from a link, not the bench. */
export async function listWarehouseItemsByIds(user: PlatformUser, orderIds: string[]): Promise<WarehouseItem[]> {
  requireWarehouse(user);
  const ids = [...new Set(orderIds)];
  if (ids.length === 0) return [];
  return hydrateItems(await listWarehouseOrders({ ids, limit: ids.length }));
}

/**
 * Log a parcel in at the hub. Writes the customer's "At our US hub" journey
 * event, with the weight the scale read, and moves a `paid` order to
 * `processing`. Idempotent: logging the same parcel twice without a new weight
 * returns it unchanged rather than writing a second arrival.
 */
export async function receiveWarehouseItem(
  user: PlatformUser,
  orderId: string,
  input: ReceiveItemInput,
): Promise<WarehouseItem> {
  requireWarehouse(user);
  const [order] = await listWarehouseOrders({ ids: [orderId] });
  if (!order) throw new APIError(404, "Item not found");
  if (!BENCH_STATUSES.includes(order.status)) {
    throw new APIError(409, `This order is ${order.status.replace("_", " ")} and is not expected at the hub.`);
  }

  // The status moves FIRST: `paid → processing` writes the customer's
  // "purchased" event, and the arrival must come after it on their timeline.
  if (order.status === "paid" && !order.held_at) {
    try {
      await advanceOrderFromWarehouse(user, order.id, "processing");
    } catch (error) {
      // The arrival is recorded either way; the status is the admin's to fix.
      logger.warn("warehouse receive: could not advance paid order", {
        orderId: order.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const arrivals = await listHubArrivals([orderId]);
  const already = arrivals.get(orderId);
  const newWeight = input.weight_lbs ?? null;
  const sameWeight = already && (newWeight === null || already.weight_lbs === newWeight);

  if (!sameWeight) {
    await recordOrderEvent({
      order_id: order.id,
      order_group_id: order.order_group_id,
      kind: "hub_received",
      title: already ? "Re-weighed at our US hub" : "Arrived at our US hub",
      detail: input.note?.trim() || null,
      location: input.location?.trim() || "US hub",
      weight_lbs: newWeight,
      is_customer_visible: true,
      created_by: user.id,
    });
    await logAuditEvent({
      actorId: user.id,
      actorRole: warehouseActorRole(user),
      action: already ? "warehouse_item_reweighed" : "warehouse_item_received",
      entityType: AUDIT_ENTITY_TYPES.ORDER,
      entityId: order.id,
      metadata: { order_no: order.order_no, weight_lbs: newWeight, location: input.location ?? null },
    });
  }

  return getWarehouseItem(user, orderId);
}

// ── Packages ────────────────────────────────────────────────────────────────

export async function listWarehousePackages(
  user: PlatformUser,
  filters: { statuses?: PackageStatus[]; limit?: number } = {},
): Promise<WarehousePackage[]> {
  requireWarehouse(user);
  const rows = await listPackages({ statuses: filters.statuses, limit: filters.limit ?? 100 });
  return hydratePackages(rows);
}

export async function getWarehousePackage(user: PlatformUser, id: string): Promise<WarehousePackage> {
  requireWarehouse(user);
  const row = await getPackageById(id);
  if (!row) throw new APIError(404, "Package not found");
  const [pkg] = await hydratePackages([row]);
  if (!pkg) throw new APIError(404, "Package not found");
  return pkg;
}

export async function createWarehousePackage(
  user: PlatformUser,
  input: CreatePackageInput,
): Promise<WarehousePackage> {
  requireWarehouse(user);
  const { order_ids = [], lines = [], ...details } = input;
  if (order_ids.length > 0) await assertPackable(order_ids);

  const row = await insertPackage({ ...toPatch(details), created_by: user.id });
  await audit(user, "warehouse_package_created", row, { reference: row.reference });

  if (order_ids.length > 0 || lines.length > 0) {
    try {
      await addLines(user, row, order_ids, lines);
    } catch (error) {
      // An empty package the operator did not ask for is worse than no package.
      await deletePackingPackage(row.id).catch(() => undefined);
      throw error;
    }
  }
  return getWarehousePackage(user, row.id);
}

/** Details can change while packing and after sealing (a waybill arrives late). */
export async function updateWarehousePackage(
  user: PlatformUser,
  id: string,
  input: UpdatePackageInput,
): Promise<WarehousePackage> {
  requireWarehouse(user);
  const current = await requirePackage(id);
  if (current.status === "shipped") {
    const allowed = new Set(["carrier", "tracking_number", "notes"]);
    const touched = Object.keys(input).filter((k) => input[k as keyof UpdatePackageInput] !== undefined);
    if (touched.some((k) => !allowed.has(k))) {
      throw new APIError(409, "This package has shipped. Only the carrier, tracking number and notes can change.");
    }
  }
  const patch = toPatch(input);
  if (Object.keys(patch).length === 0) return getWarehousePackage(user, id);

  const row = await updatePackage(id, current.status, patch);
  if (!row) throw new APIError(409, "Someone else just changed this package. Refresh and try again.");
  await audit(user, "warehouse_package_updated", row, { fields: Object.keys(patch) });
  return getWarehousePackage(user, id);
}

export async function addWarehousePackageItems(
  user: PlatformUser,
  id: string,
  input: AddPackageItemsInput,
): Promise<WarehousePackage> {
  requireWarehouse(user);
  const pkg = await requirePackage(id);
  if (pkg.status !== "packing") {
    throw new APIError(409, "This package is sealed. Reopen it to change what is inside.");
  }
  const orderIds = input.order_ids ?? [];
  if (orderIds.length > 0) await assertPackable(orderIds);
  await addLines(user, pkg, orderIds, input.lines ?? []);
  return getWarehousePackage(user, id);
}

export async function removeWarehousePackageItem(
  user: PlatformUser,
  id: string,
  itemId: string,
): Promise<WarehousePackage> {
  requireWarehouse(user);
  const pkg = await requirePackage(id);
  if (pkg.status !== "packing") {
    throw new APIError(409, "This package is sealed. Reopen it to change what is inside.");
  }
  const removed = await deletePackageItem(id, itemId);
  if (!removed) throw new APIError(404, "That item is not in this package");
  await audit(user, "warehouse_package_item_removed", pkg, {
    order_id: removed.order_id,
    description: removed.description,
  });
  return getWarehousePackage(user, id);
}

/** Tape it shut. Contents freeze; the label is now the truth about the box. */
export async function sealWarehousePackage(user: PlatformUser, id: string): Promise<WarehousePackage> {
  requireWarehouse(user);
  const pkg = await getWarehousePackage(user, id);
  if (pkg.status !== "packing") throw new APIError(409, "This package is already sealed.");
  if (pkg.line_count === 0) throw new APIError(400, "Add at least one item before sealing.");
  if (pkg.held_count > 0) {
    throw new APIError(409, "An item in this package is on hold. Release it or take it out before sealing.");
  }

  const row = await updatePackage(id, "packing", {
    status: "sealed",
    sealed_at: new Date().toISOString(),
    sealed_by: user.id,
  });
  if (!row) throw new APIError(409, "Someone else just changed this package. Refresh and try again.");
  await audit(user, "warehouse_package_sealed", row, { unit_count: pkg.unit_count });
  return getWarehousePackage(user, id);
}

export async function reopenWarehousePackage(user: PlatformUser, id: string): Promise<WarehousePackage> {
  requireWarehouse(user);
  const row = await updatePackage(id, "sealed", { status: "packing", sealed_at: null, sealed_by: null });
  if (!row) throw new APIError(409, "Only a sealed package that has not shipped can be reopened.");
  await audit(user, "warehouse_package_reopened", row, {});
  return getWarehousePackage(user, id);
}

/**
 * The package leaves the hub. Every order inside moves to `in_transit`, which
 * sends each customer their status email and journey event through the same
 * path an admin's status change takes.
 *
 * Not atomic across orders, and honest about it: an order that fails to move
 * (held since sealing, changed by an admin) is reported back and the package
 * stays `sealed`, so the operator fixes the one and ships again. Orders already
 * in transit are skipped, which makes the retry safe.
 */
export async function shipWarehousePackage(
  user: PlatformUser,
  id: string,
  input: ShipPackageInput,
): Promise<{ package: WarehousePackage; failed: Array<{ order_no: string; reason: string }> }> {
  requireWarehouse(user);
  const pkg = await getWarehousePackage(user, id);
  if (pkg.status !== "sealed") {
    throw new APIError(409, pkg.status === "shipped" ? "This package has already shipped." : "Seal the package before shipping it.");
  }

  const carrier = input.carrier?.trim() || pkg.carrier || undefined;
  const trackingNumber = input.tracking_number?.trim() || pkg.tracking_number || undefined;
  const failed: Array<{ order_no: string; reason: string }> = [];

  for (const line of pkg.lines) {
    const item = line.item;
    if (!item || item.order_status === "in_transit") continue;
    try {
      if (item.order_status === "paid") {
        await advanceOrderFromWarehouse(user, item.order_id, "processing");
      }
      // 086: the air waybill / forwarder number is INTERNAL. It stays on the
      // package; the order (and so the customer's email, WhatsApp and journey)
      // is tracked by its Tomame number only.
      await advanceOrderFromWarehouse(user, item.order_id, "in_transit");
    } catch (error) {
      failed.push({
        order_no: item.order_no,
        reason: error instanceof APIError ? error.message : "Could not update this order",
      });
    }
  }

  if (failed.length > 0) {
    await audit(user, "warehouse_package_ship_partial", pkg, { failed });
    return { package: await getWarehousePackage(user, id), failed };
  }

  const row = await updatePackage(id, "sealed", {
    status: "shipped",
    shipped_at: new Date().toISOString(),
    shipped_by: user.id,
    ...(carrier ? { carrier } : {}),
    ...(trackingNumber ? { tracking_number: trackingNumber } : {}),
  });
  if (!row) throw new APIError(409, "Someone else just changed this package. Refresh and try again.");
  await audit(user, "warehouse_package_shipped", row, {
    order_count: pkg.lines.filter((l) => l.item).length,
    carrier: carrier ?? null,
    tracking_number: trackingNumber ?? null,
  });
  return { package: await getWarehousePackage(user, id), failed };
}

export async function deleteWarehousePackage(user: PlatformUser, id: string): Promise<void> {
  requireWarehouse(user);
  const row = await deletePackingPackage(id);
  if (!row) throw new APIError(409, "Only a package that is still being packed can be deleted.");
  await audit(user, "warehouse_package_deleted", row, { reference: row.reference });
}

/** Counted, so "how many copies of this label exist" has an answer. */
export async function recordLabelPrint(user: PlatformUser, id: string): Promise<void> {
  requireWarehouse(user);
  const current = await requirePackage(id);
  const row = await updatePackage(id, current.status, {
    label_printed_at: new Date().toISOString(),
    label_print_count: current.label_print_count + 1,
  });
  if (row) await audit(user, "warehouse_label_printed", row, { copy: row.label_print_count });
}

// ── Lookup and scanning ─────────────────────────────────────────────────────

/**
 * Resolve whatever a scanner typed: a package reference, an order number, or
 * the whole URL a label's QR code encodes. Case and spacing are forgiven,
 * because a handheld scanner and a thumb both get them wrong.
 */
export async function lookupWarehouseCode(user: PlatformUser, raw: string): Promise<LookupResult> {
  requireWarehouse(user);
  const code = normaliseCode(raw);
  try {
    const result = await resolveCode(code, raw);
    // 082: every scan lands in the admin's activity trail. Never throws.
    if (result.kind === "inbound_unmatched") {
      // 086: a carrier barcode nobody registered. A failed lookup, not an
      // error: the operator is offered "link it" or "log it as unmatched".
      await recordWarehouseActivity(user, {
        kind: WAREHOUSE_ACTIVITY_KINDS.LOOKUP_FAILED,
        metadata: { code: result.code, raw: raw.trim().slice(0, 120), inbound: true },
      });
    } else if (result.kind === "inbound") {
      await recordWarehouseActivity(user, {
        kind: WAREHOUSE_ACTIVITY_KINDS.SCAN,
        metadata: { code: result.tracking_key, inbound_parcel_id: result.id },
      });
    } else {
      await recordWarehouseActivity(user, {
        kind: WAREHOUSE_ACTIVITY_KINDS.SCAN,
        subject_type: result.kind === "package" ? "warehouse_package" : "order",
        subject_id: result.id,
        metadata: { code: result.kind === "package" ? result.reference : result.order_no },
      });
    }
    return result;
  } catch (error) {
    // A code that found nothing is the one scan an admin should see: a torn
    // label, a typo, or a parcel that is not ours. The raw text is capped —
    // it is whatever a scanner or a thumb produced.
    if (error instanceof APIError && (error.statusCode === 404 || error.statusCode === 400)) {
      await recordWarehouseActivity(user, {
        kind: WAREHOUSE_ACTIVITY_KINDS.LOOKUP_FAILED,
        metadata: { code: code?.slice(0, 80) ?? null, raw: raw.trim().slice(0, 120) },
      });
    }
    throw error;
  }
}

async function resolveCode(code: string | null, raw: string): Promise<LookupResult> {
  if (!code) throw new APIError(400, "Scan a label or type a package or order number.");

  if (code.startsWith("PKG-")) {
    const pkg = await getPackageByReference(code);
    if (!pkg) throw new APIError(404, `No package ${code}.`);
    return { kind: "package", id: pkg.id, reference: pkg.reference };
  }
  if (code.startsWith("TM-")) {
    const order = await getWarehouseOrderByNo(code);
    if (!order) throw new APIError(404, `No order ${code}.`);
    return { kind: "order", id: order.id, order_no: order.order_no };
  }
  // 086: anything else long enough to be a carrier's number is a store parcel
  // arriving. The raw scan is normalised again, because the USPS routing prefix
  // and the FNC1 separator are only recognisable before `normaliseCode`.
  const tracking = normaliseTracking(raw) ?? normaliseTracking(code);
  if (tracking) {
    const parcel = await findInboundParcelByKeys(tracking.candidates);
    if (parcel) {
      return { kind: "inbound", id: parcel.id, tracking_key: parcel.tracking_key };
    }
    return { kind: "inbound_unmatched", code: tracking.key };
  }
  throw new APIError(404, "That code is not a Tomame package or order.");
}

export function normaliseCode(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  // The QR encodes `<origin>/warehouse/p/PKG-10042`; keep only the last segment.
  const fromUrl = value.match(/\/warehouse\/p\/([^/?#\s]+)/i);
  if (fromUrl?.[1]) value = decodeURIComponent(fromUrl[1]);
  value = value.toUpperCase().replace(/\s+/g, "");
  const pkg = value.match(/^PKG-?(\d{3,})$/);
  if (pkg) return `PKG-${pkg[1]}`;
  const order = value.match(/^TM-?(\d{1,})$/);
  if (order?.[1]) return `TM-${order[1].padStart(5, "0")}`;
  // A bare package number. Capped at eight digits: anything longer is a
  // carrier's tracking number (USPS and FedEx are all digits), not ours.
  if (/^\d{5,8}$/.test(value)) return `PKG-${value}`;
  return value;
}

// ── Dashboard and issues ────────────────────────────────────────────────────

export async function getWarehouseDashboard(user: PlatformUser): Promise<WarehouseDashboard> {
  requireWarehouse(user);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [items, counts, activeRows, shippedRows, openFeedback] = await Promise.all([
    listWarehouseItems(user),
    countPackagesByStatus(),
    listPackages({ statuses: ["packing", "sealed"], limit: 24 }),
    listPackages({ statuses: ["shipped"], shippedSince: weekAgo, limit: 50 }),
    listOrderFeedback("open"),
  ]);
  const [active, recentlyShipped] = await Promise.all([
    hydratePackages(activeRows),
    hydratePackages(shippedRows.slice(0, 6)),
  ]);

  return {
    counts: {
      awaiting: items.filter((i) => i.stage === "awaiting").length,
      received: items.filter((i) => i.stage === "received").length,
      packing: counts.packing,
      sealed: counts.sealed,
      shipped_7d: shippedRows.length,
      held: items.filter((i) => i.held).length,
      issues_open: openFeedback.filter((f) => f.verdict !== "looks_right").length,
    },
    active,
    recently_shipped: recentlyShipped,
    ready_to_pack: items.filter((i) => i.stage === "received").slice(0, 12),
  };
}

/** What customers said about their parcel photos, with the item attached. */
export async function listWarehouseIssues(
  user: PlatformUser,
  status?: OrderFeedbackStatus,
): Promise<WarehouseIssue[]> {
  requireWarehouse(user);
  // Confirmations ("looks right") come back too; the board files them apart
  // from complaints rather than hiding them, since they still need clearing.
  const rows = await listOrderFeedback(status);
  const orderIds = [...new Set(rows.map((r) => r.order_id))];
  const orders = await listWarehouseOrders({ ids: orderIds });
  const items = new Map((await hydrateItems(orders)).map((i) => [i.order_id, i]));
  return rows.map((r) => ({
    id: r.id,
    order_id: r.order_id,
    photo_id: r.photo_id,
    verdict: r.verdict,
    message: r.message,
    status: r.status,
    resolution: r.resolution,
    resolved_at: r.resolved_at,
    created_at: r.created_at,
    item: items.get(r.order_id) ?? null,
  }));
}

export async function getWarehouseReturnAddress(user: PlatformUser): Promise<WarehouseReturnAddress> {
  requireWarehouse(user);
  const raw = (await getWarehouseAddress()) ?? {};
  const text = (key: string) => {
    const v = raw[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return {
    name: text("name") ?? "Tomame US Hub",
    line1: text("line1"),
    line2: text("line2"),
    city: text("city"),
    phone: text("phone"),
    email: text("email"),
  };
}

// ── Internals ───────────────────────────────────────────────────────────────

async function requirePackage(id: string): Promise<PackageRow> {
  const row = await getPackageById(id);
  if (!row) throw new APIError(404, "Package not found");
  return row;
}

/** Every order must be on the bench, not held, and not already in a package. */
async function assertPackable(orderIds: string[]): Promise<void> {
  const unique = [...new Set(orderIds)];
  const [orders, existing] = await Promise.all([
    listWarehouseOrders({ ids: unique }),
    listItemsForOrders(unique),
  ]);
  const byId = new Map(orders.map((o) => [o.id, o]));
  for (const id of unique) {
    const order = byId.get(id);
    if (!order) throw new APIError(404, "One of those items no longer exists.");
    if (!BENCH_STATUSES.includes(order.status)) {
      throw new APIError(409, `${order.order_no} is ${order.status.replace("_", " ")} and cannot be packed.`);
    }
    if (order.held_at) {
      throw new APIError(409, `${order.order_no} is on hold: ${order.hold_reason ?? "no reason given"}.`);
    }
  }
  if (existing.length > 0) {
    const packages = await Promise.all([...new Set(existing.map((e) => e.package_id))].map(getPackageById));
    const refs = packages.filter(Boolean).map((p) => p!.reference);
    const orderNos = existing.map((e) => byId.get(e.order_id!)?.order_no).filter(Boolean);
    throw new APIError(409, `${orderNos.join(", ")} ${orderNos.length === 1 ? "is" : "are"} already in ${refs.join(", ")}.`);
  }
}

async function addLines(
  user: PlatformUser,
  pkg: PackageRow,
  orderIds: string[],
  lines: Array<{ description: string; quantity: number }>,
): Promise<void> {
  const orders = orderIds.length ? await listWarehouseOrders({ ids: orderIds }) : [];
  const quantities = new Map(orders.map((o) => [o.id, Math.max(1, Number(o.quantity) || 1)]));
  const rows = [
    ...[...new Set(orderIds)].map((orderId) => ({
      package_id: pkg.id,
      order_id: orderId,
      description: null,
      quantity: quantities.get(orderId) ?? 1,
      added_by: user.id,
    })),
    ...lines.map((line) => ({
      package_id: pkg.id,
      order_id: null,
      description: line.description.trim(),
      quantity: line.quantity,
      added_by: user.id,
    })),
  ];
  const { conflict } = await insertPackageItems(rows);
  if (conflict) {
    throw new APIError(409, "Someone else just packed one of those items. Refresh and try again.");
  }
  await audit(user, "warehouse_package_items_added", pkg, {
    order_ids: orderIds,
    custom_lines: lines.length,
  });
}

async function audit(
  user: PlatformUser,
  action: string,
  pkg: Pick<PackageRow, "id" | "reference">,
  metadata: Record<string, unknown>,
): Promise<void> {
  await logAuditEvent({
    actorId: user.id,
    actorRole: warehouseActorRole(user),
    action,
    entityType: AUDIT_ENTITY_TYPES.WAREHOUSE_PACKAGE,
    entityId: pkg.id,
    metadata: { reference: pkg.reference, ...metadata },
  });
}

function toPatch(input: Partial<UpdatePackageInput>): PackagePatch {
  const patch: PackagePatch = {};
  const keys = [
    "service",
    "origin",
    "destination",
    "weight_lbs",
    "length_in",
    "width_in",
    "height_in",
    "carrier",
    "tracking_number",
    "fragile",
    "this_way_up",
    "keep_dry",
    "notes",
  ] as const;
  for (const key of keys) {
    const value = input[key];
    if (value === undefined) continue;
    (patch as Record<string, unknown>)[key] = typeof value === "string" ? value.trim() || null : value;
  }
  // Origin and destination are NOT NULL; a blank means "leave it".
  if (patch.origin === null) delete patch.origin;
  if (patch.destination === null) delete patch.destination;
  return patch;
}

/** Orders → the DTO. The one place a warehouse item is shaped. */
async function hydrateItems(orders: WarehouseOrderRow[]): Promise<WarehouseItem[]> {
  if (orders.length === 0) return [];
  const orderIds = orders.map((o) => o.id);
  const groupIds = [...new Set(orders.map((o) => o.order_group_id).filter((g): g is string => !!g))];
  const userIds = [...new Set(orders.map((o) => o.user_id))];
  const boxIds = [...new Set(orders.map((o) => o.consolidation_box_id).filter((b): b is string => !!b))];

  const [arrivals, photos, packageItems, snapshots, profiles, boxes, openIssues] = await Promise.all([
    listHubArrivals(orderIds),
    listPhotoIdsByOrder(orderIds),
    listItemsForOrders(orderIds),
    listGroupDeliverySnapshots(groupIds),
    listRecipientProfiles(userIds),
    listBoxRefs(boxIds),
    listOpenFeedbackOrderIds(orderIds),
  ]);

  const packageIds = [...new Set(packageItems.map((p) => p.package_id))];
  const packages = new Map<string, PackageRow>();
  await Promise.all(
    packageIds.map(async (id) => {
      const row = await getPackageById(id);
      if (row) packages.set(id, row);
    }),
  );
  const packageByOrder = new Map(packageItems.map((p) => [p.order_id!, packages.get(p.package_id)]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return orders.map((order) => {
    const pkg = packageByOrder.get(order.id) ?? null;
    const arrival = arrivals.get(order.id) ?? null;
    const photoIds = photos.get(order.id) ?? [];
    const box = order.consolidation_box_id ? boxes.get(order.consolidation_box_id) : undefined;
    const stage: ItemStage = pkg
      ? pkg.status === "shipped"
        ? "shipped"
        : "packed"
      : arrival
        ? "received"
        : order.status === "in_transit"
          ? "shipped"
          : "awaiting";

    return {
      order_id: order.id,
      order_no: order.order_no,
      title: order.product_name?.trim() || "Untitled item",
      image_url: safeImageUrl(order.product_image_url),
      store: storeName(order.product_url),
      quantity: Math.max(1, Number(order.quantity) || 1),
      listed_weight_lbs: orderWeightLbs(order),
      order_status: order.status,
      stage,
      held: order.held_at ? { reason: order.hold_reason ?? "On hold" } : null,
      has_open_issue: openIssues.has(order.id),
      received: arrival
        ? { at: arrival.occurred_at, weight_lbs: arrival.weight_lbs, location: arrival.location }
        : null,
      photo_ids: photoIds.slice(0, PHOTO_PREVIEW_LIMIT),
      photo_count: photoIds.length,
      package: pkg ? { id: pkg.id, reference: pkg.reference, status: pkg.status } : null,
      box: box ? { id: box.id, label: box.label, departs_at: box.departs_at } : null,
      customer_key: order.user_id,
      recipient: toRecipient(
        order.order_group_id ? snapshots.get(order.order_group_id) ?? null : null,
        profileById.get(order.user_id) ?? null,
      ),
      special_instructions: order.special_instructions?.trim() || null,
      created_at: order.created_at,
    };
  });
}

async function hydratePackages(rows: PackageRow[]): Promise<WarehousePackage[]> {
  if (rows.length === 0) return [];
  const lines = await listPackageItems(rows.map((r) => r.id));
  const orderIds = lines.map((l) => l.order_id).filter((id): id is string => !!id);
  const orders = orderIds.length
    ? await listWarehouseOrders({ ids: [...new Set(orderIds)], limit: 1000 })
    : [];
  const items = new Map((await hydrateItems(orders)).map((i) => [i.order_id, i]));
  const staffIds = [
    ...new Set(rows.flatMap((r) => [r.created_by, r.sealed_by, r.shipped_by]).filter((x): x is string => !!x)),
  ];
  const names = await getProfileNames(staffIds);

  const linesByPackage = new Map<string, PackageItemRow[]>();
  for (const line of lines) {
    linesByPackage.set(line.package_id, [...(linesByPackage.get(line.package_id) ?? []), line]);
  }

  return rows.map((row) => {
    const own = (linesByPackage.get(row.id) ?? []).map((line) => ({
      id: line.id,
      quantity: line.quantity,
      description: line.description,
      item: line.order_id ? items.get(line.order_id) ?? null : null,
      created_at: line.created_at,
    }));
    const recipients = new Map<string, WarehouseRecipient>();
    for (const line of own) {
      if (line.item) recipients.set(line.item.customer_key, line.item.recipient);
    }
    const weights = own
      .map((l) => (l.item ? (l.item.received?.weight_lbs ?? (l.item.listed_weight_lbs ?? 0) * l.quantity) : 0));
    const estimated = weights.reduce((a, b) => a + b, 0);
    const boxes = new Map(own.filter((l) => l.item?.box).map((l) => [l.item!.box!.id, l.item!.box!]));

    return {
      id: row.id,
      reference: row.reference,
      package_no: row.package_no,
      status: row.status,
      service: row.service,
      origin: row.origin,
      destination: row.destination,
      weight_lbs: row.weight_lbs,
      estimated_weight_lbs: estimated > 0 ? Math.round(estimated * 100) / 100 : null,
      length_in: row.length_in,
      width_in: row.width_in,
      height_in: row.height_in,
      carrier: row.carrier,
      tracking_number: row.tracking_number,
      fragile: row.fragile,
      this_way_up: row.this_way_up,
      keep_dry: row.keep_dry,
      notes: row.notes,
      lines: own,
      unit_count: own.reduce((a, l) => a + l.quantity, 0),
      line_count: own.length,
      recipients: [...recipients.values()],
      is_consolidated: recipients.size > 1,
      held_count: own.filter((l) => l.item?.held).length,
      issue_count: own.filter((l) => l.item?.has_open_issue).length,
      box: boxes.size === 1 ? ([...boxes.values()][0] ?? null) : null,
      created_by_name: row.created_by ? names.get(row.created_by) ?? null : null,
      sealed_by_name: row.sealed_by ? names.get(row.sealed_by) ?? null : null,
      shipped_by_name: row.shipped_by ? names.get(row.shipped_by) ?? null : null,
      sealed_at: row.sealed_at,
      shipped_at: row.shipped_at,
      label_printed_at: row.label_printed_at,
      label_print_count: row.label_print_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

/**
 * The label's "Deliver to". The checkout snapshot wins — it is what the
 * customer confirmed — and the profile fills a name or phone it lacks. Only
 * the fields a label needs are copied; the snapshot's ids and fee are not.
 */
export function toRecipient(
  snapshot: Record<string, unknown> | null,
  profile: { first_name: string | null; last_name: string | null; phone: string | null } | null,
): WarehouseRecipient {
  const s = (key: string) => {
    const v = snapshot?.[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const profileName = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() : "";
  const kind = s("kind");
  return {
    name: s("recipient_name") ?? (profileName || null),
    phone: s("phone") ?? profile?.phone?.trim() ?? null,
    kind: kind === "door" || kind === "pickup" ? kind : null,
    line1: s("line1"),
    line2: s("line2"),
    area: s("area"),
    city: s("city"),
    region: s("region"),
    digital_address: s("digital_address"),
    zone_name: s("zone_name"),
  };
}

function orderWeightLbs(order: WarehouseOrderRow): number | null {
  const fromPricing = order.pricing?.weight_lbs;
  if (fromPricing != null && Number.isFinite(Number(fromPricing))) return Number(fromPricing);
  const product = (order.extraction_metadata as { product?: { weight_lbs?: unknown } } | null)?.product;
  const listed = product?.weight_lbs;
  return listed != null && Number.isFinite(Number(listed)) ? Number(listed) : null;
}

function storeName(url: string | null): string | null {
  if (!url) return null;
  const known = findStore(url);
  if (known) return known.name;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Only an https image goes to the browser; the page renders it as a plain <img>. */
function safeImageUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
