import "server-only";

import type { OrderEventRow } from "@/db/queries/order-events";
import { listOrderGroupsByIds, type OrderGroupRow } from "@/db/queries/order-groups";
import { mapCustomerOrderEvents } from "@/features/orders/services/order-events.service";
import { journeyStageFor } from "@/features/orders/services/journey-stage";
import {
  deriveJourneyTrack,
  noteFor,
  type TrackStopKey,
} from "@/features/orders/services/journey-track";
import { listUserOrders } from "@/features/orders/services/orders.service";
import { findStore } from "@/features/extraction/stores";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PlatformUser } from "@/features/users/types";
import type { Order } from "@/features/orders/types";
import { formatEtaWindow, formatShortDay } from "../format";
import type {
  JourneyCtaKind,
  JourneyFilter,
  JourneyFilterKey,
  JourneyRow,
  JourneyStopCount,
  JourneysViewModel,
} from "../types";

/**
 * `v2-journeys` — the list, assembled server-side.
 *
 * Every number on the screen is a grouped count over real rows: the three filter
 * pills, the five counters on the "Where things are" rail, and each row's stage
 * position. The mock's figures ("Moving · 3") are samples; these are the
 * customer's own orders.
 *
 * The five-stop rail counts parcels by where they STAND, which is why it is
 * derived from `journey-track.ts` rather than from `orders.status` alone — a
 * parcel logged into the US hub stands on the hub stop even though no status
 * says so. See that module for why "US hub" is not a status.
 */

/** The pills, in the mock's order (design line 283). */
const FILTERS: readonly { key: JourneyFilterKey; label: string }[] = [
  { key: "moving", label: "Moving" },
  { key: "delivered", label: "Delivered" },
  { key: "awaiting_payment", label: "Awaiting payment" },
];

/** The rail's stops, in track order. Labels come from the track module's own vocabulary. */
const STOP_LABELS: readonly { key: TrackStopKey; label: string }[] = [
  { key: "paid", label: "Paid" },
  { key: "purchased", label: "Purchased" },
  { key: "hub", label: "Our hub" },
  { key: "in_the_air", label: "In the air" },
  { key: "your_door", label: "Your door" },
];

export async function getJourneys(user: PlatformUser): Promise<JourneysViewModel> {
  // RLS scopes this to the viewer; the service never filters by a client-supplied id.
  const client = await createClient();
  const { orders } = await listUserOrders(client, user);

  // Two follow-up reads, each one query for the whole list rather than one per
  // row. Both are service-role: the events read has already been scoped by the
  // order ids that came back under RLS above, and `order_groups` has no
  // customer-facing read policy of its own.
  const admin = createAdminClient();
  const [eventsByOrder, groups] = await Promise.all([
    mapCustomerOrderEvents(admin, orders.map((order) => order.id)),
    listOrderGroupsByIds(groupIdsOf(orders)),
  ]);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const siblings = countSiblings(orders);

  const rows = orders.map((order) =>
    toRow(order, eventsByOrder.get(order.id) ?? [], groupById, siblings),
  );

  return {
    filters: countFilters(rows),
    stops: countStops(orders, eventsByOrder),
    rows,
    count: rows.length,
  };
}

// ── Rows ────────────────────────────────────────────────────────────────────

function toRow(
  order: Order,
  events: OrderEventRow[],
  groupById: Map<string, OrderGroupRow>,
  siblings: Map<string, string[]>,
): JourneyRow {
  const stage = journeyStageFor(order.status);
  const track = deriveJourneyTrack({
    status: order.status,
    events,
    etaFrom: order.eta_from ?? null,
    etaTo: order.eta_to ?? null,
    deliveredAt: order.delivered_at,
  });

  const group = order.order_group_id ? (groupById.get(order.order_group_id) ?? null) : null;
  // Unpaid, and nothing else is holding the money: a lone legacy order pays for
  // itself, an order in a bag pays as part of its group, and a group already
  // settled is not payable however its orders read.
  const isPayable =
    order.status === "pending" && (group ? group.status === "pending" : true);

  const bagOrderIds = order.order_group_id ? (siblings.get(order.order_group_id) ?? []) : [];
  const index = bagOrderIds.indexOf(order.id);

  return {
    id: order.id,
    orderNo: order.order_no,
    productName: order.product_name,
    productUrl: order.product_url,
    productImageUrl: order.product_image_url,
    store: storeNameOf(order),
    createdAt: order.created_at,
    quantity: order.quantity,
    totalGhs: totalGhsOf(order),
    status: order.status,
    stageLabel: stage.label,
    tone: stage.tone,
    percent: track.percent,
    hint: hintFor(order, events, stage.hint),
    cta: ctaFor(order.status, isPayable),
    filter: filterFor(order.status),
    orderGroupId: order.order_group_id ?? null,
    groupPosition:
      bagOrderIds.length > 1 && index >= 0
        ? { index: index + 1, total: bagOrderIds.length }
        : null,
    isPayable,
  };
}

/**
 * The line under the progress bar.
 *
 * In order of truthfulness: what actually last happened, then the delivery
 * window if one is set, then the stage's own hint. The mock's samples
 * ("Departed Cincinnati · lands Accra Sat", "Rate locked till 4:12 PM today")
 * splice a real event onto a forecast; only the real half is written here.
 */
function hintFor(order: Order, events: OrderEventRow[], fallback: string): string | null {
  const latest = newestEvent(events);
  if (latest) {
    const note = noteFor(latest);
    const stamp = formatShortDay(latest.occurred_at);
    return [latest.title, note, stamp].filter((part): part is string => !!part).join(" · ");
  }

  const window = formatEtaWindow(etaOf(order));
  if (window) return `At your door ${window}`;

  return fallback || null;
}

function newestEvent(events: readonly OrderEventRow[]): OrderEventRow | null {
  let best: OrderEventRow | null = null;
  for (const event of events) {
    if (!best || event.occurred_at > best.occurred_at) best = event;
  }
  return best;
}

/**
 * The window an operator confirmed, else the estimate the quote showed
 * (`pricing.delivery_eta_from/to`, written pre-purchase from the region's transit
 * band). Null when the order has neither — nothing is invented from a status.
 */
export function etaOf(order: Order): { from: string | null; to: string | null; source: "confirmed" | "estimated" } | null {
  if (order.eta_from || order.eta_to) {
    return { from: order.eta_from ?? null, to: order.eta_to ?? null, source: "confirmed" };
  }
  if (order.estimated_delivery_date) {
    return {
      from: order.estimated_delivery_date,
      to: order.estimated_delivery_date,
      source: "confirmed",
    };
  }
  const from = order.pricing?.delivery_eta_from ?? null;
  const to = order.pricing?.delivery_eta_to ?? null;
  return from || to ? { from, to, source: "estimated" } : null;
}

/**
 * Which control the row offers.
 *
 * "Pay now" only when a transaction can actually be opened — offering it on an
 * order whose group is already paid would send the customer to a 400.
 */
function ctaFor(status: string, isPayable: boolean): JourneyCtaKind {
  if (isPayable) return "pay";
  if (status === "delivered" || status === "completed") return "buy_again";
  if (status === "in_transit") return "track";
  return "details";
}

/** Cancelled orders sit behind no pill: they are neither moving, delivered, nor owed for. */
function filterFor(status: string): JourneyFilterKey | null {
  switch (status) {
    case "pending":
      return "awaiting_payment";
    case "paid":
    case "processing":
    case "in_transit":
      return "moving";
    case "delivered":
    case "completed":
      return "delivered";
    default:
      return null;
  }
}

// ── Counts ──────────────────────────────────────────────────────────────────

function countFilters(rows: readonly JourneyRow[]): JourneyFilter[] {
  return FILTERS.map(({ key, label }) => ({
    key,
    label,
    count: rows.filter((row) => row.filter === key).length,
  }));
}

/**
 * How many parcels stand on each stop.
 *
 * A parcel is counted ONCE, on the stop it currently occupies — not on every
 * stop it has passed. The mock's rail reads "Paid 1 / Purchased 1 / US hub 0 /
 * In the air 1 / Your door 0" over four orders, which is a census of positions,
 * not a cumulative funnel. Unpaid and cancelled orders stand on no stop.
 */
function countStops(
  orders: readonly Order[],
  eventsByOrder: Map<string, OrderEventRow[]>,
): JourneyStopCount[] {
  const counts = new Map<TrackStopKey, number>();

  for (const order of orders) {
    const track = deriveJourneyTrack({
      status: order.status,
      events: eventsByOrder.get(order.id) ?? [],
      deliveredAt: order.delivered_at,
    });
    if (track.isCancelled) continue;

    // The stop the parcel occupies: the one marked `now`, or the last `done`
    // one for a finished journey.
    const current =
      track.stops.find((stop) => stop.state === "now") ??
      [...track.stops].reverse().find((stop) => stop.state === "done");
    if (!current) continue;

    counts.set(current.key, (counts.get(current.key) ?? 0) + 1);
  }

  return STOP_LABELS.map(({ key, label }) => ({ key, label, count: counts.get(key) ?? 0 }));
}

// ── Small derivations ───────────────────────────────────────────────────────

function groupIdsOf(orders: readonly Order[]): string[] {
  return [
    ...new Set(
      orders
        .map((order) => order.order_group_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
}

/** Order ids per group, oldest first — the order they were checked out in. */
function countSiblings(orders: readonly Order[]): Map<string, string[]> {
  const byGroup = new Map<string, Order[]>();
  for (const order of orders) {
    if (!order.order_group_id) continue;
    const list = byGroup.get(order.order_group_id);
    if (list) list.push(order);
    else byGroup.set(order.order_group_id, [order]);
  }

  const result = new Map<string, string[]>();
  for (const [groupId, groupOrders] of byGroup) {
    result.set(
      groupId,
      [...groupOrders]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((order) => order.id),
    );
  }
  return result;
}

/**
 * The store's registry name, falling back to what the extraction called the
 * platform. Null when the URL matches nothing we know — better a row with no
 * store than one labelled with a bare hostname the customer never typed.
 */
export function storeNameOf(order: Order): string | null {
  const known = findStore(order.product_url);
  if (known) return known.name;
  const platform = order.extraction_metadata?.platform;
  return typeof platform === "string" && platform.trim().length > 0 ? platform : null;
}

/** The admin's override when one was set, else the stored breakdown's total. */
export function totalGhsOf(order: Order): number | null {
  if (order.admin_total_ghs != null && Number.isFinite(order.admin_total_ghs)) {
    return order.admin_total_ghs;
  }
  const total = order.pricing?.total_ghs;
  return typeof total === "number" && Number.isFinite(total) ? total : null;
}
