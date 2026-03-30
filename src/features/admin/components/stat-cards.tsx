import React from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HandCoinsIcon, ScanSearchIcon, ShoppingCartIcon, UsersRoundIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardStats } from "../types";

interface StatCardsProps {
  stats: DashboardStats | undefined;
  isLoading?: boolean;
}

function fmt(n: number | undefined, decimals = 0) {
  if (n === undefined) return "—";
  return new Intl.NumberFormat("en-GH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function StatCards({ stats, isLoading }: StatCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
      {/* Total Orders */}
      <Card className="@container/card soft-shadow border-none space-y-0">
        <CardHeader >
          <CardTitle>Total Orders</CardTitle>
          <CardDescription className="-mt-1.5">Orders submitted and completed</CardDescription>
          <CardAction className="bg-rose-200/20 border-rose-200 border rounded-md p-2 -mt-1.5">
            <ShoppingCartIcon className="stroke-rose-500" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-16" /> : fmt(stats?.totalOrders)}
          </div>
        </CardContent>
      </Card>

      {/* Total Revenue */}
      <Card className="@container/card soft-shadow border-none">
        <CardHeader >
          <CardTitle>Total Revenue</CardTitle>
          <CardDescription className="-mt-2">Revenue from paid orders</CardDescription>
          <CardAction className="bg-purple-200/20 border-purple-200 border rounded-md p-2 -mt-1.5">
            <HandCoinsIcon className="stroke-purple-500" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-24" /> : `GHS ${fmt(stats?.totalRevenueGhs, 2)}`}          </div>
        </CardContent>
      </Card>

      {/* Active Users */}
      <Card className="@container/card soft-shadow border-none">
        <CardHeader >
          <CardTitle>Active Users</CardTitle>
          <CardDescription className="-mt-1.5">Users using the platform</CardDescription>
          <CardAction className="bg-sky-200/20 border-sky-200 border rounded-md p-2 -mt-1.5">
            <UsersRoundIcon className="stroke-sky-500" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-14" /> : fmt(stats?.activeUsers)}
          </div>
        </CardContent>
      </Card>

      {/* Needs Review */}
      <Card className="@container/card soft-shadow border-none">
        <CardHeader >
          <CardTitle>Needs Review</CardTitle>
          <CardDescription className="-mt-1.5">Orders that needs admin review</CardDescription>
          <CardAction className="bg-amber-200/20 border-amber-200 border rounded-md p-2 -mt-1.5">
            <ScanSearchIcon className="stroke-amber-500" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-10" /> : fmt(stats?.ordersNeedingReview)}          
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
