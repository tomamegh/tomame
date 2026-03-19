import type { Order, OrderStatus } from "@/features/orders/types";

export type DeliveryStatus = Extract<
  OrderStatus,
  "processing" | "in_transit" | "delivered" | "completed"
>;

/** Deliveries are orders in the post-payment shipping pipeline, enriched with order_deliveries data */
export interface Delivery extends Order {
  tracking_url?: string | null;
  delivery_notes?: string | null;
}

export interface DeliveryList {
  deliveries: Delivery[];
  count: number;
}

export interface DeliveryStats {
  total: number;
  pendingDispatch: number;
  inTransit: number;
  delivered: number;
}
