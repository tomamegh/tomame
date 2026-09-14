import type {
  OrderFeedbackStatus,
  OrderFeedbackVerdict,
} from "@/db/queries/order-feedback";

/**
 * What the customer is handed back after saying something about their parcel.
 *
 * A deliberate subset of the row: `handled_by` and `user_id` are staff and
 * identity columns, and neither belongs in a browser. `resolution` IS here —
 * the loop is pointless if the answer never reaches the person who complained.
 */
export interface OrderFeedback {
  id: string;
  order_id: string;
  photo_id: string | null;
  verdict: OrderFeedbackVerdict;
  message: string;
  status: OrderFeedbackStatus;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
}
