export type TransactionStatus = "pending" | "success" | "failed";

export interface Transaction {
  id: string;
  userId: string;
  reference: string;
  /** Amount in pesewas (GHS × 100) */
  amount: number;
  /** Amount in GHS (amount / 100) */
  amountGhs: number;
  currency: string;
  status: TransactionStatus;
  metadata: Record<string, unknown> | null;
  createdAt: string;
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
