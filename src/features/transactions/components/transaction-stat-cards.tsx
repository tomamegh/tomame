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
  CreditCardIcon,
  TrendingUpIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { TransactionStats } from "../types";

interface TransactionStatCardsProps {
  stats: TransactionStats | undefined;
  isLoading?: boolean;
}

function fmt(n: number | undefined, decimals = 0) {
  if (n === undefined) return "—";
  return new Intl.NumberFormat("en-GH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function TransactionStatCards({
  stats,
  isLoading,
}: TransactionStatCardsProps) {
  const successRate =
    stats && stats.total > 0
      ? Math.round((stats.successful / stats.total) * 100)
      : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Transactions */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Transactions</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-16" /> : fmt(stats?.total)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <CreditCardIcon />
              All time
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            All payment attempts <CreditCardIcon className="size-4" />
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
              Successful
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium text-green-600">
            Revenue from successful payments <TrendingUpIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">Paid in GHS</div>
        </CardFooter>
      </Card>

      {/* Success Rate */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Success Rate</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              `${successRate}%`
            )}
          </CardTitle>
          <CardAction>
            <Badge
              variant="outline"
              className={
                successRate >= 80
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-600 border-amber-500/30"
              }
            >
              <CheckCircle2Icon />
              {successRate >= 80 ? "Good" : "Low"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Payment success rate <CheckCircle2Icon className="size-4" />
          </div>
          <div className="text-muted-foreground">
            {isLoading ? "—" : `${fmt(stats?.successful)} of ${fmt(stats?.total)} successful`}
          </div>
        </CardFooter>
      </Card>

      {/* Failed */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Failed</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? (
              <Skeleton className="h-8 w-10" />
            ) : (
              fmt(stats?.failed)
            )}
          </CardTitle>
          <CardAction>
            {(stats?.failed ?? 0) > 0 ? (
              <Badge
                variant="outline"
                className="bg-red-500/10 text-red-600 border-red-500/30"
              >
                <XCircleIcon />
                Attention
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
            className={`line-clamp-1 flex gap-2 font-medium ${(stats?.failed ?? 0) > 0 ? "text-red-600" : ""}`}
          >
            Failed payments <XCircleIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">Requires investigation</div>
        </CardFooter>
      </Card>
    </div>
  );
}
