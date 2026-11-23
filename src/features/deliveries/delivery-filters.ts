import type { OrderStatus } from "@/config/constants";
import { ADMIN_ORDER_FILTERS } from "@/features/orders/admin-status-filters";

/**
 * Admin Deliveries' filters (site brief, Fix 15): one definition per stage,
 * shared by the summary tiles, the chips and the list. Delivered is delivered +
 * completed (the screen had two "Delivered" chips, 1 and 23), and Moving is
 * only what is still on its way (it used to count 24 delivered orders).
 */
export const DELIVERY_FILTERS = {
  moving: { label: "Moving", statuses: ["processing", "in_transit"] },
  processing: ADMIN_ORDER_FILTERS.processing,
  in_transit: ADMIN_ORDER_FILTERS.in_transit,
  delivered: ADMIN_ORDER_FILTERS.delivered,
  all: { label: "All", statuses: ["processing", "in_transit", "delivered", "completed"] },
} as const satisfies Record<string, { label: string; statuses: readonly OrderStatus[] }>;

export type DeliveryFilter = keyof typeof DELIVERY_FILTERS;

export const DELIVERY_FILTER_ORDER: readonly DeliveryFilter[] = ["moving", "processing", "in_transit", "delivered", "all"];

/** Unknown or absent: Moving, the default view. */
export function deliveryFilterOf(value: string | undefined): DeliveryFilter {
  return value && Object.prototype.hasOwnProperty.call(DELIVERY_FILTERS, value) ? (value as DeliveryFilter) : "moving";
}

export function deliveryFilterCount(filter: DeliveryFilter, byStatus: Partial<Record<OrderStatus, number>>): number {
  return DELIVERY_FILTERS[filter].statuses.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
}

// ── Shipped packages vs delivered orders ────────────────────────────────────

export interface ShipmentFacts {
  packages_shipped: number;
  /** Orders inside shipped packages, by where they are now. */
  in_shipped_packages: { in_transit: number; delivered: number; other: number };
  /** Delivered (or completed) orders, by how they left the hub. */
  delivered: { in_shipped_package: number; in_unshipped_package: number; no_package: number };
}

/**
 * Why "packages shipped" and "orders delivered" are different numbers, in words.
 * They count different things: a package holds several orders, an order that
 * shipped before packages existed (081) or was moved on from the admin console
 * has no package, and a shipped package's orders may still be in the air.
 */
export function reconcileShipments(f: ShipmentFacts): { agree: boolean; lines: string[] } {
  const deliveredTotal = f.delivered.in_shipped_package + f.delivered.in_unshipped_package + f.delivered.no_package;
  const ordersShipped = f.in_shipped_packages.in_transit + f.in_shipped_packages.delivered + f.in_shipped_packages.other;
  const p = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  if (deliveredTotal === 0 && ordersShipped === 0 && f.packages_shipped === 0) return { agree: true, lines: ["Nothing has shipped or been delivered yet."] };
  const lines = [
    `${p(f.packages_shipped, "package")} shipped, holding ${p(ordersShipped, "order")}: ${f.in_shipped_packages.delivered} delivered, ${f.in_shipped_packages.in_transit} still in the air${f.in_shipped_packages.other ? `, ${f.in_shipped_packages.other} in another state` : ""}.`,
    `${p(deliveredTotal, "order")} delivered: ${f.delivered.in_shipped_package} went in a shipped package, ${f.delivered.no_package} left without one (shipped before packages existed, or moved on from the admin console)${f.delivered.in_unshipped_package ? `, and ${f.delivered.in_unshipped_package} sit in a package never marked shipped (a record to fix)` : ""}.`,
  ];
  return { agree: f.delivered.no_package === 0 && f.delivered.in_unshipped_package === 0, lines };
}
