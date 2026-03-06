import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCartIcon,
  TrendingUpIcon,
  AlertTriangleIcon,
  XCircleIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Order } from "../types";

interface OrderStats {
  total: number;
  totalRevenueGhs: number;
  needsReview: number;
  cancelled: number;
}

function computeStats(orders: Order[]): OrderStats {
  return {
    total: orders.length,
    totalRevenueGhs: orders
      .filter((o) => o.status !== "cancelled" && o.status !== "pending")
      .reduce((acc, o) => acc + (o.pricing?.total_ghs ?? 0), 0),
    needsReview: orders.filter((o) => o.needsReview).length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
  };
}

function fmt(n: number | undefined, decimals = 0) {
  if (n === undefined) return "—";
  return new Intl.NumberFormat("en-GH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

interface OrderStatCardsProps {
  orders: Order[] | undefined;
  isLoading?: boolean;
}

export function OrderStatCards({ orders, isLoading }: OrderStatCardsProps) {
  const stats = orders ? computeStats(orders) : undefined;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Orders */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Orders</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-16" /> : fmt(stats?.total)}
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
      <Card className="@container/card">
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
            <Badge
              variant="outline"
              className="bg-green-500/10 text-green-600 border-green-500/30"
            >
              <TrendingUpIcon />
              Paid orders
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium text-green-600">
            Revenue from active orders <TrendingUpIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">Excludes pending & cancelled</div>
        </CardFooter>
      </Card>

      {/* Needs Review */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Needs Review</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? (
              <Skeleton className="h-8 w-10" />
            ) : (
              fmt(stats?.needsReview)
            )}
          </CardTitle>
          <CardAction>
            {(stats?.needsReview ?? 0) > 0 ? (
              <Badge
                variant="outline"
                className="bg-amber-500/10 text-amber-600 border-amber-500/30"
              >
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
          <div
            className={`line-clamp-1 flex gap-2 font-medium ${(stats?.needsReview ?? 0) > 0 ? "text-amber-600" : ""}`}
          >
            Flagged for review <AlertTriangleIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">Requires admin attention</div>
        </CardFooter>
      </Card>

      {/* Cancelled */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Cancelled</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? (
              <Skeleton className="h-8 w-10" />
            ) : (
              fmt(stats?.cancelled)
            )}
          </CardTitle>
          <CardAction>
            {(stats?.cancelled ?? 0) > 0 ? (
              <Badge
                variant="outline"
                className="bg-red-500/10 text-red-600 border-red-500/30"
              >
                <XCircleIcon />
                Cancelled
              </Badge>
            ) : (
              <Badge variant="outline">
                <XCircleIcon />
                None
              </Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div
            className={`line-clamp-1 flex gap-2 font-medium ${(stats?.cancelled ?? 0) > 0 ? "text-red-600" : ""}`}
          >
            Cancelled orders <XCircleIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">By customer or admin</div>
        </CardFooter>
      </Card>
    </div>
  );
}
