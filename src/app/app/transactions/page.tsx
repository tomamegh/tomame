import { TransactionsList } from "@/features/payments/components";

export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Transactions</h1>
        <p className="text-stone-400 text-sm mt-1">
          Your payment history
        </p>
      </div>
      <TransactionsList />
    </div>
  );
}
