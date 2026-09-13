// ── Database row type ─────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  user_id: string;
  reference: string;
  amount: number;
  currency: string;
  status: "pending" | "success" | "failed";
  channel: string | null;
  metadata: Record<string, unknown> | null;
  /** The order group this payment buys (048). Null for legacy single-order payments. */
  order_group_id: string | null;
  created_at: string;
}

/**
 * One entry of `site_settings.payment_channels` (reshaped in 048). `id` is what
 * the browser sends back; `paystack_channel` is what Paystack is asked to offer;
 * `provider` is the MoMo network for metadata; `dot` is the brand colour swatch.
 */
export interface PaymentChannel {
  id: string;
  label: string;
  paystack_channel: "mobile_money" | "card";
  provider: "mtn" | "vod" | "atl" | null;
  dot: string | null;
}

// ── Request types ────────────────────────────────────────────────────────────

export interface InitializePaymentRequest {
  /** Legacy: one order. */
  orderId?: string;
  /** The bag's order group — one Paystack transaction for N orders. */
  orderGroupId?: string;
  /** `PaymentChannel.id` from `site_settings.payment_channels`. */
  channel?: string;
}

// ── Response types ───────────────────────────────────────────────────────────

export interface PaymentResponse {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  channel: string | null;
  createdAt: string;
}

export interface InitializePaymentResponse {
  payment: PaymentResponse;
  authorizationUrl: string;
}

export interface PaymentInsert {
  user_id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  metadata?: Record<string, unknown> | null;
  order_group_id?: string | null;
}
