export type PaymentStatus = "pending" | "success" | "failed";

export interface Transaction {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
}

export interface TransactionList {
  transactions: Transaction[];
  count: number;
}
