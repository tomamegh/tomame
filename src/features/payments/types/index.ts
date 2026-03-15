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
