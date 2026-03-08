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
  UsersRoundIcon,
  ShieldIcon,
  UserIcon,
  CalendarIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserStats } from "../types";

interface UserStatCardsProps {
  stats: UserStats | undefined;
  isLoading?: boolean;
}

function fmt(n: number | undefined) {
  if (n === undefined) return "—";
  return new Intl.NumberFormat("en-GH").format(n);
}

export function UserStatCards({ stats, isLoading }: UserStatCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Users */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Users</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-16" /> : fmt(stats?.total)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <UsersRoundIcon />
              All time
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Registered accounts <UsersRoundIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">Platform-wide</div>
        </CardFooter>
      </Card>

      {/* Admins */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Admins</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? <Skeleton className="h-8 w-10" /> : fmt(stats?.admins)}
          </CardTitle>
          <CardAction>
            <Badge
              variant="outline"
              className="bg-rose-500/10 text-rose-600 border-rose-500/30"
            >
              <ShieldIcon />
              Admin role
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium text-rose-600">
            Admin accounts <ShieldIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">With elevated privileges</div>
        </CardFooter>
      </Card>

      {/* Regular Users */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Regular Users</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              fmt(stats?.regularUsers)
            )}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <UserIcon />
              User role
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Customer accounts <UserIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">Standard access level</div>
        </CardFooter>
      </Card>

      {/* New This Month */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>New This Month</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {isLoading ? (
              <Skeleton className="h-8 w-10" />
            ) : (
              fmt(stats?.newThisMonth)
            )}
          </CardTitle>
          <CardAction>
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
            >
              <CalendarIcon />
              This month
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium text-emerald-600">
            New signups <CalendarIcon className="size-4" />
          </div>
          <div className="text-muted-foreground">Joined this calendar month</div>
        </CardFooter>
      </Card>
    </div>
  );
}
