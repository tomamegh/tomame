"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ExtractionForm } from "@/features/extraction/components/extraction-form";
import { OrdersList } from "@/features/orders/components";

export default function DashboardPage() {
  const router = useRouter();

  const handleExtract = (url: string) => {
    router.push(`/app/orders/new?url=${encodeURIComponent(url)}`);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-stone-800 mb-2">
          Welcome back!
        </h1>
        <p className="text-stone-500">
          Here&apos;s what&apos;s happening with your orders today.
        </p>
      </div>

      {/* URL input — navigates to /app/new on submit */}
      <div className="py-2">
        <ExtractionForm onSubmit={handleExtract} isLoading={false} />
      </div>

      {/* Recent Orders */}
      <div className="space-y-5 mt-12">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-stone-800">
            Your Recent Orders
          </h2>
          <Button variant="primary" size="sm" asChild>
            <Link href="/app/orders">View All</Link>
          </Button>
        </div>

        <div className="space-y-3">
          <OrdersList variant="recent" />
        </div>
      </div>
    </div>
  );
}
