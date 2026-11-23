import "server-only";

import { listInboundLinks } from "@/db/queries/inbound-parcels";
import { planDay } from "@/features/journeys/delivery-plan";
import { firmPlansFor, recordFirmDates, type FirmPlan } from "@/features/journeys/services/firm-dates.service";
import { notifyCustomer } from "@/features/notifications/services/customer-notify.service";
import type { PlatformUser } from "@/features/users/types";
import { shipmentUpdateTemplate } from "@/lib/email/templates/shipment-update";
import { env } from "@/lib/env";
import { requireWarehouse } from "@/lib/auth/guards";
import { whatsappMessages } from "@/lib/whatsapp/templates";

import { readTrackingEntry } from "../inbound/tracking-link";
import type { InboundParcel, WarehouseItem } from "../types";
import { registerInboundTracking } from "./inbound.service";
import { checkStoreLink, setStoreTrackingLink } from "./store-link.service";
import { listWarehouseItemsByIds } from "./warehouse.service";

export const STORE_TRACKING_EVENT = "store_tracking_added";

export interface AddTrackingInput {
  order_ids: string[];
  tracking_numbers: string[];
  store_order_ref?: string | null;
  /** Put the store's carrier and number in the customer's message. Off by default (Tomame's number only). */
  share_store_tracking?: boolean;
}

export interface AddTrackingResult {
  /** Orders that gained at least one tracking number. */
  added: string[];
  /** Numbers or orders that could not be saved, each with the reason, so the screen names them. */
  refused: Array<{ order_no: string | null; input: string | null; reason: string }>;
  /** Customers told "the store has shipped it". */
  notified: number;
}

/**
 * Store tracking added after "Mark as purchased", or added to many orders at
 * once (one store order for a whole checkout). Each number goes through
 * `registerInboundTracking` (086, validated per Fix 12), so the hub's scan
 * finds the orders when the parcel lands. A link is turned into its number
 * first; a tracking page with no number in it (Amazon's Share tracking) is kept
 * on the order as a link (141), which staff can open but the hub cannot scan.
 *
 * The customer hears once: the first time an order gets tracking while it is
 * still on its way to the hub. Corrections and extra numbers say nothing. The
 * message carries Tomame's number; the store's only when staff tick "share".
 */
export async function addOrdersStoreTracking(user: PlatformUser, input: AddTrackingInput, now: Date = new Date()): Promise<AddTrackingResult> {
  requireWarehouse(user);
  const entries = input.tracking_numbers.map((n) => readTrackingEntry(n.trim())).filter((e) => e.input);
  const numbers = [...new Set(entries.filter((e) => !e.link).map((e) => e.number).filter(Boolean))];
  const result: AddTrackingResult = { added: [], refused: [], notified: 0 };

  // The last link pasted wins; one that is not tracking is named and left out.
  let link: string | null = null;
  for (const entry of entries.filter((e) => e.link)) {
    const problem = entry.problem ?? (await checkStoreLink(entry.link!));
    if (problem) result.refused.push({ order_no: null, input: entry.input, reason: problem });
    else link = entry.link;
  }

  const items = await listWarehouseItemsByIds(user, input.order_ids);
  const before = new Set([
    ...(await listInboundLinks({ orderIds: items.map((i) => i.order_id) })).map((l) => l.order_id),
    ...items.filter((i) => i.store_tracking_url).map((i) => i.order_id),
  ]);

  const firstTime: Array<{ item: WarehouseItem; parcels: InboundParcel[] }> = [];
  for (const id of input.order_ids) {
    if (!items.some((i) => i.order_id === id)) result.refused.push({ order_no: null, input: null, reason: "Order not found" });
  }

  for (const item of items) {
    if (item.order_status === "paid") {
      result.refused.push({ order_no: item.order_no, input: null, reason: "Not bought yet. Mark it purchased, with the tracking, instead." });
      continue;
    }
    const parcels: InboundParcel[] = [];
    for (const number of numbers) {
      try {
        parcels.push(await registerInboundTracking(user, { order_id: item.order_id, tracking_number: number, store_order_ref: input.store_order_ref ?? undefined }));
      } catch (error) {
        result.refused.push({ order_no: item.order_no, input: number, reason: error instanceof Error ? error.message : "Could not save it" });
      }
    }
    let linked = false;
    if (link) {
      try {
        linked = (await setStoreTrackingLink(user, [item], link)).length > 0;
      } catch (error) {
        result.refused.push({ order_no: item.order_no, input: link, reason: error instanceof Error ? error.message : "Could not save the link" });
      }
    }
    if (parcels.length === 0 && !linked) continue;
    result.added.push(item.order_id);
    if (!before.has(item.order_id) && item.order_status === "processing" && !item.received) firstTime.push({ item, parcels });
  }

  // Seamless Roadmap, Initiative 2: the firm door date rides on this message, never a second one.
  const plans = await firmPlansFor(firstTime.map((r) => ({ id: r.item.order_id, status: r.item.order_status }))).catch(() => new Map<string, FirmPlan>());
  for (const group of byCustomer(firstTime)) {
    await tellCustomer(group, input.share_store_tracking === true, link, plans, now);
    result.notified += 1;
  }
  await recordFirmDates(plans, "store_tracking");
  return result;
}

function byCustomer(rows: Array<{ item: WarehouseItem; parcels: InboundParcel[] }>) {
  const out = new Map<string, Array<{ item: WarehouseItem; parcels: InboundParcel[] }>>();
  for (const row of rows) out.set(row.item.customer_key, [...(out.get(row.item.customer_key) ?? []), row]);
  return [...out.values()];
}

async function tellCustomer(
  rows: Array<{ item: WarehouseItem; parcels: InboundParcel[] }>,
  share: boolean,
  link: string | null,
  plans: ReadonlyMap<string, FirmPlan>,
  now: Date,
): Promise<void> {
  const first = rows[0]!.item;
  const what = rows.length === 1 ? `order ${first.order_no}` : `${rows.length} of your orders`;
  // The latest door date across the orders, on the flight that gives it.
  const plan = rows
    .map((r) => plans.get(r.item.order_id))
    .filter((p): p is FirmPlan => !!p)
    .sort((a, b) => a.deliveryOn.localeCompare(b.deliveryOn))
    .at(-1);
  const by = plan ? planDay(plan.deliveryOn) : null;
  const description = plan
    ? `The store has shipped it to our US hub. It is booked on ${plan.flight.carrier} ${plan.flight.origin} → Accra, ${planDay(plan.flight.departsOn)}, so it should be at your door by ${by}.`
    : "The store has shipped it to our US hub. We'll tell you when it arrives.";
  const shared = share
    ? [
        ...new Map(rows.flatMap((r) => r.parcels).map((p) => [p.id, `${p.carrier_label} ${p.tracking_display}`])).values(),
        ...(link ? [link] : []),
      ].join(", ") || null
    : null;
  const message = shared ? `Store tracking: ${shared}` : null;
  const template = shipmentUpdateTemplate({
    kind: "stage",
    stageTitle: "Shipped by the store",
    description,
    message,
    expectedOn: by,
    expectedLabel: "At your door by",
    items: rows.map((r) => ({ orderNo: r.item.order_no, productName: r.item.title })),
    contact: null,
    journeyUrl: `${env.app.url}/app/orders/${first.order_id}`,
  });
  await notifyCustomer({
    userId: first.customer_key,
    event: STORE_TRACKING_EVENT,
    payload: {
      order_ids: rows.map((r) => r.item.order_id),
      order_no: first.order_no,
      order_count: rows.length,
      stage_title: "Shipped by the store",
      message: description,
      delivery_on: plan?.deliveryOn ?? null,
      href: `/app/orders/${first.order_id}`,
    },
    template,
    now,
    whatsapp: {
      message: whatsappMessages.shipmentUpdate({
        orderId: first.order_id,
        what,
        update: `Shipped by the store to our US hub${shared ? ` (${shared})` : ""}${by ? `. At your door by ${by}` : ""}`,
      }),
      dedupeKey: `${STORE_TRACKING_EVENT}:${rows.map((r) => r.item.order_id).sort().join(",")}`,
    },
    source: "store-tracking-added",
  });
}
