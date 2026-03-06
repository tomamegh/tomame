"use client";

import { TransactionStatCards } from "@/features/transactions/components/transaction-stat-cards";
import { useAdminTransactions } from "@/features/transactions/hooks/useTransactions";

export function TransactionsPageClient() {
  const { data, isLoading } = useAdminTransactions();
  return <TransactionStatCards stats={data?.stats} isLoading={isLoading} />;
}
