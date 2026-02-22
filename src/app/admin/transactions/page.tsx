import { AdminTransactionsList } from "@/features/payments/components";

export default function AdminTransactionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Transactions</h1>
        <p className="text-stone-400 text-sm mt-1">
          All payment transactions across all users
        </p>
      </div>
      <AdminTransactionsList />
    </div>
  );
}
