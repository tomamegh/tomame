import type { CourierProvider } from "./schema";

/**
 * The courier on an order's delivery row (migration 075), as the app reads it.
 *
 * Null from every reader when no rider has been dispatched: a delivery row can
 * exist (ETA window, carrier) long before the last mile starts.
 */
export interface OrderCourier {
  orderId: string;
  name: string | null;
  /** E.164, `+233XXXXXXXXX`. */
  phone: string | null;
  trackingUrl: string | null;
  provider: CourierProvider | null;
  dispatchedAt: string;
  /** The admin who last saved and sent it. */
  dispatchedBy: string | null;
  lastNotifiedAt: string | null;
  /** 125: the delivery window staff gave the customer, when they gave one. */
  window: { start: string; end: string } | null;
  /** 126: the customer missed the rider and asked for this window instead, until staff send it out again. */
  rebook: { requestedAt: string; start: string; end: string } | null;
}

/** What the admin card shows under "Last sent". */
export interface AdminOrderCourier extends OrderCourier {
  dispatchedByName: string | null;
}

export interface CourierDispatchResult {
  courier: OrderCourier;
  /** `order_courier_dispatched` the first time, `order_courier_updated` after. */
  action: "order_courier_dispatched" | "order_courier_updated" | "duplicate";
  /**
   * `notified` — the bell row is written and the email went (or email is off);
   * `email_failed` — the bell row is written, the transport refused;
   * `skipped` — identical details sent moments ago, nothing re-sent.
   */
  notification: "notified" | "email_failed" | "skipped" | "error";
}
