import "server-only";

import {
  insertOrderEvents,
  listOrderEventsForOrders,
  type OrderEventInsert,
  type OrderEventRow,
} from "@/db/queries/order-events";
import { listStageSettingRows, upsertStageSettingRow } from "@/db/queries/shipment-stage-settings";
import {
  getPackageById,
  listLooseInTransitOrders,
  listPackageItems,
  listPackages,
  listWarehouseOrders,
  updatePackage,
  type PackageRow,
  type WarehouseOrderRow,
} from "@/db/queries/warehouse";
import { AUDIT_ENTITY_TYPES } from "@/config/constants";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { advanceOrderFromWarehouse } from "@/features/orders/services/orders.service";
import type { MoveShipmentsInput, ShipmentNoticeInput, StageSettingInput } from "@/features/shipments/schema";
import { notifyShipmentUpdate } from "@/features/shipments/shipment-notify.service";
import { loadStageSettings } from "@/features/shipments/stage-settings.service";
import {
  activeNotice,
  currentStageKey,
  reachedRank,
  settingsByStage,
  STAGE_RANK,
  type MovableStage,
  type ShipmentStageKey,
  type StageSetting,
} from "@/features/shipments/stages";
import type { PlatformUser } from "@/features/users/types";
import { APIError } from "@/lib/auth/api-helpers";
import { requireAdmin, requireWarehouse, warehouseActorRole } from "@/lib/auth/guards";
import { createAdminClient as createAdmin } from "@/lib/supabase/admin";

import type { ShipmentBoard, ShipmentOrder } from "../types";
import { hydrateItems, hydratePackages } from "./warehouse.service";

/**
 * The shipments board (098): everything after a package leaves the US hub.
 *
 * A move is made on PACKAGES and/or loose ORDERS at once — a flight lands with
 * six packages, so all six are marked "Arrived in Ghana" in one action — and
 * fans out to every order inside. Each order gets one customer-visible
 * `order_events` row; `delivered` goes through the order state machine
 * (`in_transit → delivered`) and its own email, exactly like an admin's.
 *
 * Never backwards, and safe to repeat: an order already at or past the step is
 * reported as skipped, not moved twice. Not atomic across orders, and honest
 * about it — every order that could not move comes back with its reason.
 */

export interface MoveResult {
  moved: number;
  skipped: Array<{ order_no: string; reason: string }>;
  failed: Array<{ order_no: string; reason: string }>;
}

/** Delivered packages stay on the board this long, so a mis-tap can be seen. */
const DELIVERED_WINDOW_DAYS = 7;

// ── Settings ────────────────────────────────────────────────────────────────

export async function getStageSettingsForStaff(user: PlatformUser): Promise<Record<ShipmentStageKey, StageSetting>> {
  requireWarehouse(user);
  return settingsByStage(await listStageSettingRows());
}

/** Contact numbers are the admins' to set: an operator can read them, not change them. */
export async function saveStageSetting(user: PlatformUser, input: StageSettingInput): Promise<StageSetting> {
  requireAdmin(user);
  const row = await upsertStageSettingRow({ ...input, updated_by: user.id });
  await logAuditEvent({
    actorId: user.id,
    actorRole: "admin",
    action: "shipment_stage_setting_updated",
    entityType: AUDIT_ENTITY_TYPES.SITE_SETTING,
    entityId: null,
    metadata: { table: "shipment_stage_settings", stage: input.stage, contact_phone: input.contact_phone },
  });
  return row;
}

// ── The board ───────────────────────────────────────────────────────────────

export async function getShipmentBoard(user: PlatformUser): Promise<ShipmentBoard> {
  requireWarehouse(user);
  const since = new Date(Date.now() - DELIVERED_WINDOW_DAYS * 86_400_000).toISOString();
  const [moving, delivered, looseOrders] = await Promise.all([
    listPackages({
      statuses: ["shipped"],
      stages: ["departed", "arrived_country", "ghana_warehouse", "ready_for_pickup", "out_for_delivery"],
      limit: 200,
    }),
    listPackages({ statuses: ["shipped"], stages: ["delivered"], stageSince: since, limit: 50 }),
    listLooseInTransitOrders(),
  ]);
  const packages = await hydratePackages([...moving, ...delivered]);
  const packageOrderIds = packages.flatMap((p) => p.lines.flatMap((l) => (l.item ? [l.item.order_id] : [])));
  const allIds = [...new Set([...packageOrderIds, ...looseOrders.map((o) => o.id)])];
  const [events, items] = await Promise.all([eventsByOrder(allIds), hydrateItems(looseOrders)]);

  const statusById = new Map<string, string>();
  for (const p of packages) for (const l of p.lines) if (l.item) statusById.set(l.item.order_id, l.item.order_status);
  for (const o of looseOrders) statusById.set(o.id, o.status);

  const orderStages: Record<string, ShipmentStageKey | null> = {};
  for (const id of packageOrderIds) {
    orderStages[id] = currentStageKey(statusById.get(id) ?? "in_transit", events.get(id) ?? []);
  }

  const loose: ShipmentOrder[] = items.map((item) => {
    const own = events.get(item.order_id) ?? [];
    const stage = currentStageKey(item.order_status, own);
    const stageAt = latestStageAt(own, stage);
    const notice = activeNotice(own, stageAt, null);
    return {
      item,
      stage,
      stage_at: stageAt,
      notice: notice ? { message: notice.message, expected_on: notice.expectedOn, at: notice.at } : null,
    };
  });

  return { packages, loose, order_stages: orderStages };
}

// ── Moving ──────────────────────────────────────────────────────────────────

export async function moveShipments(user: PlatformUser, input: MoveShipmentsInput): Promise<MoveResult> {
  requireWarehouse(user);
  const settings = await loadStageSettings();
  const setting = settings[input.stage];
  const { packages, orders, packageByOrder } = await resolveTargets(input.package_ids, input.order_ids);
  for (const pkg of packages) {
    if (pkg.status !== "shipped") {
      throw new APIError(409, `${pkg.reference} has not shipped yet. Ship it from the package page first.`);
    }
  }

  const events = await eventsByOrder(orders.map((o) => o.id));
  const occurredAt = input.occurred_at ?? new Date().toISOString();
  const result: MoveResult = { moved: 0, skipped: [], failed: [] };
  const inserts: OrderEventInsert[] = [];
  const movedOrders: WarehouseOrderRow[] = [];

  for (const order of orders) {
    const blocked = whyNotMovable(order, events.get(order.id) ?? [], input.stage);
    if (blocked) {
      (blocked.skip ? result.skipped : result.failed).push({ order_no: order.order_no, reason: blocked.reason });
      continue;
    }

    if (input.stage === "delivered") {
      try {
        await advanceOrderFromWarehouse(user, order.id, "delivered", undefined, { staffAlert: false });
        result.moved += 1;
      } catch (error) {
        result.failed.push({
          order_no: order.order_no,
          reason: error instanceof APIError ? error.message : "Could not mark it delivered",
        });
      }
      continue;
    }

    inserts.push({
      order_id: order.id,
      order_group_id: order.order_group_id,
      kind: input.stage,
      title: setting.title,
      detail: input.message,
      location: input.location,
      occurred_at: occurredAt,
      is_customer_visible: true,
      created_by: user.id,
      package_id: packageByOrder.get(order.id) ?? null,
      contact_name: input.contact_phone ? input.contact_name : null,
      contact_phone: input.contact_phone,
    });
    movedOrders.push(order);
  }

  if (inserts.length > 0) {
    await insertOrderEvents(createAdmin(), inserts);
    result.moved += inserts.length;
  }

  // The packages moved, whatever happened to a straggler inside: the box is
  // where it is. A new step also takes down the delay notice it superseded.
  for (const pkg of packages) {
    // Never backwards and never the same step twice, which would also take
    // down a delay notice nobody resolved. Pickup ↔ delivery is a sideways fix.
    if (pkg.stage && (STAGE_RANK[pkg.stage] > STAGE_RANK[input.stage] || pkg.stage === input.stage)) continue;
    const row = await updatePackage(pkg.id, "shipped", {
      stage: input.stage,
      stage_at: occurredAt,
      stage_by: user.id,
      notice: null,
      notice_expected_on: null,
      notice_at: null,
    });
    if (row) {
      await audit(user, "shipment_stage_moved", AUDIT_ENTITY_TYPES.WAREHOUSE_PACKAGE, pkg.id, {
        reference: pkg.reference,
        from: pkg.stage,
        to: input.stage,
        message: input.message,
      });
    }
  }
  for (const order of orders) {
    if (packageByOrder.has(order.id)) continue;
    if (!movedOrders.includes(order) && input.stage !== "delivered") continue;
    await audit(user, "shipment_stage_moved", AUDIT_ENTITY_TYPES.ORDER, order.id, {
      order_no: order.order_no,
      to: input.stage,
      message: input.message,
    });
  }

  if (input.notify && movedOrders.length > 0) {
    const contact = input.contact_phone
      ? { name: input.contact_name, phone: input.contact_phone, whatsapp: true, hours: null }
      : setting.contact_phone
        ? {
            name: setting.contact_name,
            phone: setting.contact_phone,
            whatsapp: setting.contact_whatsapp,
            hours: setting.contact_hours,
          }
        : null;
    for (const [userId, own] of groupByCustomer(movedOrders)) {
      await notifyShipmentUpdate({
        kind: "stage",
        userId,
        stageKey: input.stage,
        stageTitle: setting.title,
        description: setting.description,
        message: input.message,
        expectedOn: null,
        orders: own.map(toNotifyOrder),
        contact,
      });
    }
  }
  return result;
}

/** Why an order cannot take this step, or null when it can. `skip` means nothing is wrong. */
export function whyNotMovable(
  order: Pick<WarehouseOrderRow, "status" | "held_at" | "hold_reason">,
  events: readonly Pick<OrderEventRow, "kind" | "occurred_at" | "title" | "detail" | "location">[],
  stage: MovableStage,
): { reason: string; skip: boolean } | null {
  if (order.status === "delivered" || order.status === "completed") {
    return { reason: "Already delivered", skip: true };
  }
  if (order.status !== "in_transit") {
    return { reason: `It is ${order.status.replace("_", " ")} and has not left the US hub`, skip: false };
  }
  if (order.held_at) return { reason: `On hold: ${order.hold_reason ?? "no reason given"}`, skip: false };
  const rank = reachedRank(order.status, events);
  const current = currentStageKey(order.status, events);
  if (rank > STAGE_RANK[stage] || current === stage) {
    return { reason: "Already at or past this step", skip: true };
  }
  return null;
}

// ── Delay notices ───────────────────────────────────────────────────────────

const NOTICE_STATUSES = ["paid", "processing", "in_transit"];

export async function postShipmentNotice(user: PlatformUser, input: ShipmentNoticeInput): Promise<MoveResult> {
  requireWarehouse(user);
  const settings = await loadStageSettings();
  const { packages, orders, packageByOrder } = await resolveTargets(input.package_ids, input.order_ids);
  const events = await eventsByOrder(orders.map((o) => o.id));
  const now = new Date().toISOString();
  const result: MoveResult = { moved: 0, skipped: [], failed: [] };
  const inserts: OrderEventInsert[] = [];
  const noticed: WarehouseOrderRow[] = [];

  for (const order of orders) {
    if (!NOTICE_STATUSES.includes(order.status)) {
      result.skipped.push({ order_no: order.order_no, reason: `It is ${order.status.replace("_", " ")}` });
      continue;
    }
    const own = events.get(order.id) ?? [];
    const stage = currentStageKey(order.status, own);
    const live = activeNotice(own, latestStageAt(own, stage), null);
    if (input.clear && !live) {
      result.skipped.push({ order_no: order.order_no, reason: "No delay to clear" });
      continue;
    }
    inserts.push({
      order_id: order.id,
      order_group_id: order.order_group_id,
      kind: input.clear ? "delay_cleared" : "delay",
      title: input.clear ? "Back on track" : "Delayed",
      detail: input.message,
      expected_on: input.clear ? null : input.expected_on,
      occurred_at: now,
      is_customer_visible: true,
      created_by: user.id,
      package_id: packageByOrder.get(order.id) ?? null,
      contact_name: input.contact_phone ? input.contact_name : null,
      contact_phone: input.contact_phone,
    });
    noticed.push(order);
  }

  if (inserts.length > 0) {
    await insertOrderEvents(createAdmin(), inserts);
    result.moved = inserts.length;
  }

  for (const pkg of packages) {
    const row = await updatePackage(pkg.id, pkg.status, {
      notice: input.clear ? null : input.message,
      notice_expected_on: input.clear ? null : input.expected_on,
      notice_at: input.clear ? null : now,
    });
    if (row) {
      await audit(user, input.clear ? "shipment_notice_cleared" : "shipment_notice_posted", AUDIT_ENTITY_TYPES.WAREHOUSE_PACKAGE, pkg.id, {
        reference: pkg.reference,
        message: input.message,
        expected_on: input.expected_on,
      });
    }
  }
  for (const order of noticed) {
    if (packageByOrder.has(order.id)) continue;
    await audit(user, input.clear ? "shipment_notice_cleared" : "shipment_notice_posted", AUDIT_ENTITY_TYPES.ORDER, order.id, {
      order_no: order.order_no,
      message: input.message,
      expected_on: input.expected_on,
    });
  }

  // Bad news is sent; good news shows on the page.
  if (!input.clear && input.notify && noticed.length > 0) {
    for (const [userId, own] of groupByCustomer(noticed)) {
      const stage = currentStageKey(own[0]!.status, events.get(own[0]!.id) ?? []);
      const setting = stage ? settings[stage] : null;
      await notifyShipmentUpdate({
        kind: "delay",
        userId,
        stageKey: stage ?? "delay",
        stageTitle: setting?.title ?? "Delay",
        description: input.message ?? "Your parcel is taking longer than usual.",
        message: input.message,
        expectedOn: input.expected_on,
        orders: own.map(toNotifyOrder),
        contact: input.contact_phone
          ? { name: input.contact_name, phone: input.contact_phone, whatsapp: true, hours: null }
          : setting?.contact_phone
            ? { name: setting.contact_name, phone: setting.contact_phone, whatsapp: setting.contact_whatsapp, hours: setting.contact_hours }
            : null,
      });
    }
  }
  return result;
}

// ── Internals ───────────────────────────────────────────────────────────────

async function resolveTargets(packageIds: string[], orderIds: string[]) {
  const packages: PackageRow[] = [];
  for (const id of [...new Set(packageIds)]) {
    const row = await getPackageById(id);
    if (!row) throw new APIError(404, "One of those packages no longer exists.");
    packages.push(row);
  }
  const lines = await listPackageItems(packages.map((p) => p.id));
  const packageByOrder = new Map<string, string>();
  for (const line of lines) if (line.order_id) packageByOrder.set(line.order_id, line.package_id);

  const ids = [...new Set([...packageByOrder.keys(), ...orderIds])];
  const orders = ids.length ? await listWarehouseOrders({ ids, limit: ids.length }) : [];
  if (orderIds.some((id) => !orders.find((o) => o.id === id))) {
    throw new APIError(404, "One of those orders no longer exists.");
  }
  return { packages, orders, packageByOrder };
}

async function eventsByOrder(orderIds: string[]): Promise<Map<string, OrderEventRow[]>> {
  const out = new Map<string, OrderEventRow[]>();
  if (orderIds.length === 0) return out;
  for (const row of await listOrderEventsForOrders(createAdmin(), orderIds)) {
    out.set(row.order_id, [...(out.get(row.order_id) ?? []), row]);
  }
  return out;
}

function latestStageAt(events: readonly OrderEventRow[], stage: ShipmentStageKey | null): string | null {
  if (!stage) return null;
  const kinds = stage === "paid" ? ["payment_received"] : stage === "delivered" ? ["delivered", "completed"] : [stage];
  let at: string | null = null;
  for (const e of events) if (kinds.includes(e.kind) && (!at || e.occurred_at > at)) at = e.occurred_at;
  return at;
}

function groupByCustomer(orders: WarehouseOrderRow[]): Map<string, WarehouseOrderRow[]> {
  const out = new Map<string, WarehouseOrderRow[]>();
  for (const order of orders) out.set(order.user_id, [...(out.get(order.user_id) ?? []), order]);
  return out;
}

function toNotifyOrder(order: WarehouseOrderRow) {
  return { id: order.id, orderNo: order.order_no, productName: order.product_name?.trim() || "your item" };
}

async function audit(
  user: PlatformUser,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await logAuditEvent({
    actorId: user.id,
    actorRole: warehouseActorRole(user),
    action,
    entityType: entityType as (typeof AUDIT_ENTITY_TYPES)[keyof typeof AUDIT_ENTITY_TYPES],
    entityId,
    metadata,
  });
}
