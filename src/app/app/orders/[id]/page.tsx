import { OrderDetail } from "@/features/orders/components";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <Link
        href="/app/orders"
        className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to orders
      </Link>
      <OrderDetail orderId={id} />
    </div>
  );
}
