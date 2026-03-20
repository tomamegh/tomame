import type { Order, OrderStatus } from "@/features/orders/types";

// ── Database row type ─────────────────────────────────────────────────────────

export interface DbOrderDelivery {
  id: string;
  order_id: string;
  user_id: string;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  status: "pending" | "in_transit" | "out_for_delivery" | "delivered" | "failed" | "returned";
  estimated_delivery_date: string | null;
  delivered_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

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
