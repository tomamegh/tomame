import {
  UsersRoundIcon,
  ShieldIcon,
  UserIcon,
  CalendarIcon,
} from "lucide-react";
import type { UserStats } from "../types";
import AdminStatCard from "@/features/admin/components/stat-card";

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
      <AdminStatCard
        title="Total Users"
        description="All registered accounts platform-wide"
        value={fmt(stats?.total)}
        isLoading={!!isLoading}
        icon={UsersRoundIcon}
        iconContainerClassName="bg-blue-200/20 border-blue-200"
        iconClassName="stroke-blue-500"
      />

      <AdminStatCard
        title="Admins"
        description="Accounts with elevated privileges"
        value={fmt(stats?.admins)}
        isLoading={!!isLoading}
        icon={ShieldIcon}
        iconContainerClassName="bg-rose-200/20 border-rose-200"
        iconClassName="stroke-rose-500"
      />

      <AdminStatCard
        title="Regular Users"
        description="Customer accounts with standard access"
        value={fmt(stats?.regularUsers)}
        isLoading={!!isLoading}
        icon={UserIcon}
        iconContainerClassName="bg-violet-200/20 border-violet-200"
        iconClassName="stroke-violet-500"
      />

      <AdminStatCard
        title="New This Month"
        description="New users joined this calendar month"
        value={fmt(stats?.newThisMonth)}
        isLoading={!!isLoading}
        icon={CalendarIcon}
        iconContainerClassName="bg-emerald-200/20 border-emerald-200"
        iconClassName="stroke-emerald-500"
      />
    </div>
  );
}
