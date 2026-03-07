import type { Order, OrderStatus } from "@/features/orders/types";

export type DeliveryStatus = Extract<
  OrderStatus,
  "processing" | "in_transit" | "delivered" | "completed"
>;

/** Deliveries are orders in the post-payment shipping pipeline */
export type Delivery = Order;

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
