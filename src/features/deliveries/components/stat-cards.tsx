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
  PackageIcon,
  TruckIcon,
  CheckCircle2Icon,
  ClockIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DeliveryStats } from "../types";

interface DeliveryStatCardsProps {
  stats: DeliveryStats | undefined;
  isLoading?: boolean;
}

function fmt(n: number | undefined) {
  if (n === undefined) return "—";
  return new Intl.NumberFormat("en-GH").format(n);
}

export function DeliveryStatCards({ stats, isLoading }: DeliveryStatCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Shipments */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Shipments</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-16" /> : fmt(stats?.total)}
          </CardTitle>
          <CardAction>
            {isLoading ? (
              <Skeleton className="h-6 w-20 rounded-full" />
            ) : (
              <Badge variant="outline">
                <PackageIcon />
                All time
              </Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {isLoading ? (
            <div className="space-y-2 w-full">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ) : (
            <>
              <div className="line-clamp-1 flex gap-2 font-medium">
                Orders in delivery pipeline <PackageIcon className="size-4" />
              </div>
              <div className="text-muted-foreground">Processing, transit & delivered</div>
            </>
          )}
        </CardFooter>
      </Card>

      {/* Pending Dispatch */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Pending Dispatch</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-14" /> : fmt(stats?.pendingDispatch)}
          </CardTitle>
          <CardAction>
            {isLoading ? (
              <Skeleton className="h-6 w-24 rounded-full" />
            ) : (
              <Badge
                variant="outline"
                className="bg-purple-500/10 text-purple-600 border-purple-500/30"
              >
                <ClockIcon />
                Processing
              </Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {isLoading ? (
            <div className="space-y-2 w-full">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ) : (
            <>
              <div className="line-clamp-1 flex gap-2 font-medium text-purple-600">
                Awaiting dispatch <ClockIcon className="size-4" />
              </div>
              <div className="text-muted-foreground">Ready to be shipped out</div>
            </>
          )}
        </CardFooter>
      </Card>

      {/* In Transit */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>In Transit</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-14" /> : fmt(stats?.inTransit)}
          </CardTitle>
          <CardAction>
            {isLoading ? (
              <Skeleton className="h-6 w-20 rounded-full" />
            ) : (
              <Badge
                variant="outline"
                className="bg-indigo-500/10 text-indigo-600 border-indigo-500/30"
              >
                <TruckIcon />
                Shipped
              </Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {isLoading ? (
            <div className="space-y-2 w-full">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ) : (
            <>
              <div className="line-clamp-1 flex gap-2 font-medium text-indigo-600">
                Currently in transit <TruckIcon className="size-4" />
              </div>
              <div className="text-muted-foreground">On the way to customers</div>
            </>
          )}
        </CardFooter>
      </Card>

      {/* Delivered */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Delivered</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-14" /> : fmt(stats?.delivered)}
          </CardTitle>
          <CardAction>
            {isLoading ? (
              <Skeleton className="h-6 w-20 rounded-full" />
            ) : (
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
              >
                <CheckCircle2Icon />
                Complete
              </Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {isLoading ? (
            <div className="space-y-2 w-full">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ) : (
            <>
              <div className="line-clamp-1 flex gap-2 font-medium text-emerald-600">
                Successfully delivered <CheckCircle2Icon className="size-4" />
              </div>
              <div className="text-muted-foreground">Delivered & completed orders</div>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
