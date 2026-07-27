import type { PlatformUser } from "@/features/users/types";

export type TransactionStatus = "pending" | "success" | "failed";

export interface Transaction {
  id: string;
  user_id: string;
  reference: string;
  /** Amount in pesewas (GHS × 100) */
  amount: number;
  /** Computed: amount / 100 */
  amount_ghs: number;
  currency: string;
  status: TransactionStatus;
  /** Hubtel channel: "mtn-gh" | "vodafone-gh" | "tigo-gh". */
  channel: string | null;
  customer_msisdn: string | null;
  provider_transaction_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface TransactionList {
  transactions: Transaction[];
  count: number;
}

export interface TransactionStats {
  total: number;
  totalRevenueGhs: number;
  successful: number;
  failed: number;
}

export interface TransactionDetailOrder {
  id: string;
  product_name: string;
  product_image_url: string | null;
  status: string;
  origin_country: string;
  quantity: number;
}

export interface TransactionDetail extends Transaction {
  order: TransactionDetailOrder | null;
  customer: PlatformUser | null;
  /** Raw Hubtel verification payload from metadata */
  provider_data: Record<string, unknown> | null;
}
