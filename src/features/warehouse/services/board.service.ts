import "server-only";

import { listInboundLinks, listInboundParcels } from "@/db/queries/inbound-parcels";
import { listWarehouseOrders } from "@/db/queries/warehouse";
import type { PlatformUser } from "@/features/users/types";
import { requireWarehouse } from "@/lib/auth/guards";

import { BOARD_DELIVERED_DAYS, boardStageOf } from "../board/stage";
import { CARRIER_LABELS, carrierTrackingUrl, type InboundCarrier } from "../inbound/tracking-number";
import type { BoardItem, BoardTracking, OrderBoard } from "../types";
import { eventsByOrder } from "./shipment.service";
import { hydrateItems } from "./warehouse.service";

/** Active orders read at once. The board says so when it hits this, rather than counting short. */
const ACTIVE_LIMIT = 800;

/**
 * The warehouse board: every order from paid to delivered (the last week), each
 * in exactly one stage (`boardStageOf`). One read, so a stage's count and its
 * list can never disagree.
 */
export async function getOrderBoard(user: PlatformUser, now: Date = new Date()): Promise<OrderBoard> {
  requireWarehouse(user);
  const since = new Date(now.getTime() - BOARD_DELIVERED_DAYS * 86_400_000).toISOString();
  const [active, delivered] = await Promise.all([
    listWarehouseOrders({ statuses: ["paid", "processing", "in_transit"], limit: ACTIVE_LIMIT }),
    listWarehouseOrders({ statuses: ["delivered", "completed"], updatedSince: since, limit: 200 }),
  ]);
  const orders = [...active, ...delivered];
  const items = await toBoardItems(orders);
  return { items, truncated: active.length >= ACTIVE_LIMIT };
}

/** Board rows for a few orders, in any stage: the item page's next-step card. */
export async function getBoardItems(user: PlatformUser, orderIds: string[]): Promise<BoardItem[]> {
  requireWarehouse(user);
  const ids = [...new Set(orderIds)];
  if (ids.length === 0) return [];
  return toBoardItems(await listWarehouseOrders({ ids, limit: ids.length }));
}

/** One order's board row plus the other orders of its checkout (for "mark the whole checkout purchased"). */
export async function getBoardItemWithCheckout(user: PlatformUser, orderId: string): Promise<{ item: BoardItem | null; checkout: BoardItem[] }> {
  requireWarehouse(user);
  const [item] = await getBoardItems(user, [orderId]);
  if (!item?.checkout_key) return { item: item ?? null, checkout: [] };
  const siblings = await listWarehouseOrders({ groupId: item.checkout_key, limit: 50 });
  const rows = await toBoardItems(siblings.filter((o) => o.id !== orderId));
  return { item, checkout: rows };
}

async function toBoardItems(orders: Awaited<ReturnType<typeof listWarehouseOrders>>): Promise<BoardItem[]> {
  if (orders.length === 0) return [];
  const ids = orders.map((o) => o.id);
  const groupOf = new Map(orders.map((o) => [o.id, o.order_group_id]));
  const [items, events, tracking] = await Promise.all([hydrateItems(orders), eventsByOrder(ids), trackingByOrder(ids)]);

  return items.flatMap((item) => {
    const own = tracking.get(item.order_id) ?? [];
    const stage = boardStageOf({
      order_status: item.order_status,
      received: !!item.received,
      has_tracking: own.length > 0,
      package_status: item.package?.status ?? null,
      events: events.get(item.order_id) ?? [],
    });
    if (!stage) return [];
    return [{ ...item, board_stage: stage, tracking: own, checkout_key: groupOf.get(item.order_id) ?? null }];
  });
}

/** Store tracking per order (086), oldest first. Staff-facing; customers never get these through the board. */
async function trackingByOrder(orderIds: string[]): Promise<Map<string, BoardTracking[]>> {
  const out = new Map<string, BoardTracking[]>();
  const links = await listInboundLinks({ orderIds });
  if (links.length === 0) return out;
  const parcels = new Map((await listInboundParcels({ ids: [...new Set(links.map((l) => l.parcel_id))], limit: 1000 })).map((p) => [p.id, p]));
  for (const link of links) {
    const parcel = parcels.get(link.parcel_id);
    if (!parcel) continue;
    const carrier = parcel.carrier as InboundCarrier | null;
    out.set(link.order_id, [
      ...(out.get(link.order_id) ?? []),
      {
        parcel_id: parcel.id,
        display: parcel.tracking_number,
        carrier_label: carrier ? (CARRIER_LABELS[carrier] ?? "Carrier") : "Carrier",
        status: parcel.status,
        arrived_at: parcel.arrived_at,
        url: carrier ? carrierTrackingUrl(carrier, parcel.tracking_key) : null,
      },
    ]);
  }
  return out;
}
