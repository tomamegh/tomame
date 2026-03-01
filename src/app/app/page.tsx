"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CircleDollarSignIcon,
  PackageSearchIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { recentOrdersColumn } from "@/features/orders/components/recent-orders/column";
import { ExtractionForm } from "@/features/extraction/components/extraction-form";

const stats = [
  {
    label: "Total Orders",
    value: "12",
    change: "+2 this month",
    icon: ShoppingCartIcon,
  },
  {
    label: "Saved",
    value: "$340",
    change: "+$120 this month",
    icon: CircleDollarSignIcon,
  },
  {
    label: "Products",
    value: "8",
    change: "2 pending",
    icon: PackageSearchIcon,
  },
];

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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
        {stats.map((stat, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-stone-800 text-sm font-medium">
                {stat.label}
              </CardTitle>
              <div className="bg-stone-100 p-2 rounded-md">
                <stat.icon className="size-4 text-stone-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-start">
                <p className="text-3xl font-bold text-stone-800">
                  {stat.value}
                </p>
              </div>
              <p className="text-xs text-stone-400 mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
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
        <Card className="p-0 overflow-hidden">
          <DataTable data={[]} columns={recentOrdersColumn} />
        </Card>
      </div>
    </div>
  );
}
