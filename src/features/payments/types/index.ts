import type { HubtelChannel } from "@/lib/hubtel/client";

export type { HubtelChannel };

// ── Database row type ─────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  user_id: string;
  reference: string;
  amount: number;
  currency: string;
  status: "pending" | "success" | "failed";
  /** Hubtel channel: "mtn-gh" | "vodafone-gh" | "tigo-gh". */
  channel: string | null;
  /** Mobile money number that received the PIN prompt. */
  customer_msisdn: string | null;
  /** Hubtel TransactionId. */
  provider_transaction_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ── Request types ────────────────────────────────────────────────────────────

export interface InitializePaymentRequest {
  orderId: string;
  /** Ghanaian mobile money number, any of 0XXXXXXXXX / 233… / +233… */
  msisdn: string;
  channel: HubtelChannel;
}

// ── Response types ───────────────────────────────────────────────────────────

export interface PaymentResponse {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  channel: string | null;
  customerMsisdn: string | null;
  createdAt: string;
}

/**
 * There is no redirect in the Hubtel prompt flow — the customer approves a PIN
 * prompt on their handset while the client polls `/api/payments/status`.
 */
export interface InitializePaymentResponse {
  payment: PaymentResponse;
  status: string;
  message: string;
}

export interface PaymentStatusResponse {
  payment: PaymentResponse;
  orderId: string | null;
}

export interface PaymentInsert {
  user_id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  channel?: string | null;
  customer_msisdn?: string | null;
  metadata?: Record<string, unknown> | null;
}
