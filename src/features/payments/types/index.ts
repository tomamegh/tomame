// ── Database row type ─────────────────────────────────────────────────────────

export interface DbPayment {
  id: string;
  user_id: string;
  reference: string;
  amount: number;
  currency: string;
  status: "pending" | "success" | "failed";
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ── Request types ────────────────────────────────────────────────────────────

export interface InitializePaymentRequest {
  orderId: string;
}

// ── Response types ───────────────────────────────────────────────────────────

export interface PaymentResponse {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
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
}
