import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangleIcon, ShoppingCartIcon, TrendingUpIcon, UsersIcon } from "lucide-react";
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
      <Card className="@container/card soft-shadow border-none">
        <CardHeader>
          <CardDescription>Total Orders</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-16" /> : fmt(stats?.totalOrders)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <ShoppingCartIcon />
              All time
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Orders placed on platform <ShoppingCartIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">Across all customers</div>
        </CardFooter>
      </Card>

      {/* Total Revenue */}
      <Card className="@container/card soft-shadow border-none">
        <CardHeader>
          <CardDescription>Total Revenue</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              `GHS ${fmt(stats?.totalRevenueGhs, 2)}`
            )}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
              <TrendingUpIcon />
              Paid orders
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium text-green-600">
            Revenue from paid orders <TrendingUpIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">Last 30 days</div>
        </CardFooter>
      </Card>

      {/* Active Users */}
      <Card className="@container/card soft-shadow border-none">
        <CardHeader>
          <CardDescription>Active Users</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-14" /> : fmt(stats?.activeUsers)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <UsersIcon />
              30 days
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Users with orders <UsersIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">Unique customers this month</div>
        </CardFooter>
      </Card>

      {/* Needs Review */}
      <Card className="@container/card soft-shadow border-none">
        <CardHeader>
          <CardDescription>Needs Review</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-10" /> : fmt(stats?.ordersNeedingReview)}
          </CardTitle>
          <CardAction>
            {(stats?.ordersNeedingReview ?? 0) > 0 ? (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                <AlertTriangleIcon />
                Action needed
              </Badge>
            ) : (
              <Badge variant="outline">
                <AlertTriangleIcon />
                All clear
              </Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={`line-clamp-1 flex gap-2 font-medium ${(stats?.ordersNeedingReview ?? 0) > 0 ? "text-amber-600" : ""}`}>
            Orders flagged for review <AlertTriangleIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">Requires admin attention</div>
        </CardFooter>
      </Card>
    </div>
  );
}
