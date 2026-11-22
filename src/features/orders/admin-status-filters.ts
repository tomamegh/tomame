import type { OrderStatus } from "@/config/constants";

/**
 * One definition per admin order filter (site brief Fix 3): the summary tile,
 * the filter chip and the list all read this, so "Delivered" is the same orders
 * everywhere. `completed` (customer confirmed receipt, 101) is still delivered:
 * the brief found the tile counting delivered + completed (24) while the chip
 * counted delivered alone (1).
 */
export const ADMIN_ORDER_FILTERS = {
  pending: { label: "Awaiting payment", statuses: ["pending"] },
  paid: { label: "Paid", statuses: ["paid"] },
  processing: { label: "Purchased", statuses: ["processing"] },
  in_transit: { label: "In the air", statuses: ["in_transit"] },
  in_flight: { label: "In flight", statuses: ["paid", "processing", "in_transit"] },
  delivered: { label: "Delivered", statuses: ["delivered", "completed"] },
  cancelled: { label: "Cancelled", statuses: ["cancelled"] },
} as const satisfies Record<string, { label: string; statuses: readonly OrderStatus[] }>;

export type AdminOrderFilter = keyof typeof ADMIN_ORDER_FILTERS;

export function isAdminOrderFilter(value: string | undefined): value is AdminOrderFilter {
  return !!value && Object.prototype.hasOwnProperty.call(ADMIN_ORDER_FILTERS, value);
}

/** The statuses a filter lists. Unknown: null, so nothing is guessed at. */
export function statusesForFilter(value: string | undefined): readonly OrderStatus[] | null {
  return isAdminOrderFilter(value) ? ADMIN_ORDER_FILTERS[value].statuses : null;
}

/** The count a tile and a chip both show for a filter: the sum over its statuses. */
export function countForFilter(filter: AdminOrderFilter, byStatus: Partial<Record<OrderStatus, number>>): number {
  return ADMIN_ORDER_FILTERS[filter].statuses.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
}
