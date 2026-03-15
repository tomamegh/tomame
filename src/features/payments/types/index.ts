import type { DbPayment } from "@/types/db";

// ── Request types ────────────────────────────────────────────────────────────

export interface InitializePaymentRequest {
  orderId: string;
}

// ── Response types ───────────────────────────────────────────────────────────

export interface InitializePaymentResponse {
  payment: DbPayment;
  authorizationUrl: string;
}
