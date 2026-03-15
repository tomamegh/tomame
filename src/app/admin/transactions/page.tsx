import { AdminTransactionsTable } from "@/features/transactions/components/admin-transactions-table";
import { TransactionsPageClient } from "./transactions-page-client";

export default function AdminTransactionsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Transactions</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Monitor all payment transactions on the platform
        </p>
      </div>
      <TransactionsPageClient />
      <AdminTransactionsTable />
    </div>
  );
}
