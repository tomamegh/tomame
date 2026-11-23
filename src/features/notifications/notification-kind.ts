/**
 * The three kinds a notification is filtered by (site brief, Fix 8), for the
 * customer's bell and the admin log alike. Pure; an unknown event is Account
 * rather than dropped.
 */
export type NotificationKind = "orders" | "quotes" | "account";

export const NOTIFICATION_KINDS: ReadonlyArray<{ key: NotificationKind | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "orders", label: "Orders" },
  { key: "quotes", label: "Quotes" },
  { key: "account", label: "Account" },
];

const ORDER_EVENT = /^(order_|payment_|shipment_|courier_|delivery_|parcel_|store_tracking)/;
const QUOTE_EVENT = /^(paste_|price_|quote_|sourcing_|finder_|car_enquiry)/;

export function notificationKind(event: string): NotificationKind {
  if (ORDER_EVENT.test(event)) return "orders";
  if (QUOTE_EVENT.test(event)) return "quotes";
  return "account";
}

export function isNotificationKind(value: string | null | undefined): value is NotificationKind {
  return value === "orders" || value === "quotes" || value === "account";
}

/** The SQL `event` patterns of a kind, for a server-side filter (PostgREST `like`). */
export const KIND_EVENT_PREFIXES: Record<Exclude<NotificationKind, "account">, string[]> = {
  orders: ["order_", "payment_", "shipment_", "courier_", "delivery_", "parcel_", "store_tracking"],
  quotes: ["paste_", "price_", "quote_", "sourcing_", "finder_", "car_enquiry"],
};
