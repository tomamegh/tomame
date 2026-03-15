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
