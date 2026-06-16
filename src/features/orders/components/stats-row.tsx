import Link from "next/link";
import {
  ShoppingBagIcon,
  FileTextIcon,
  BanknoteIcon,
  PackageOpenIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Order } from "@/features/orders/types";

interface StatCardProps {
  label: string;
  value: string;
  compact?: boolean;
  linkLabel: string;
  linkHref: string;
  linkColor: string;
  Icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  isLoading: boolean;
}

function StatCard({
  label,
  value,
  compact,
  linkLabel,
  linkHref,
  linkColor,
  Icon,
  iconBg,
  iconColor,
  isLoading,
}: StatCardProps) {
  return (
    <Card className="group overflow-hidden rounded-2xl border-2 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.015)] py-0">
      <CardContent className="flex items-center justify-between p-5">
        <div className="min-w-0 space-y-1.5">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            {label}
          </span>
          {isLoading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <p
              className={`font-black text-stone-800 ${compact ? "text-lg sm:text-xl" : "text-2xl sm:text-3xl"}`}
            >
              {value}
            </p>
          )}
          <Link
            href={linkHref}
            className={`flex items-center gap-1 pt-1 text-xs font-semibold transition-opacity hover:opacity-90 ${linkColor}`}
          >
            <span>{linkLabel}</span>
            <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-full ${iconBg} ${iconColor}`}
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

interface StatsRowProps {
  orders: Order[] | undefined;
  isLoading: boolean;
}

export function StatsRow({ orders, isLoading }: StatsRowProps) {
  const list = orders ?? [];

  const totalOrders = list.length;
  const activeOrders = list.filter(
    (o) =>
      o.status !== "delivered" &&
      o.status !== "completed" &&
      o.status !== "cancelled",
  ).length;
  const totalSpent = list
    .filter((o) => o.status !== "cancelled" && o.status !== "pending")
    .reduce((acc, o) => acc + (o.pricing?.total_ghs ?? 0), 0);
  const deliveredOrders = list.filter(
    (o) => o.status === "delivered" || o.status === "completed",
  ).length;

  const formattedSpent = totalSpent.toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div
      className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      aria-label="Order statistics"
    >
      <StatCard
        label="Total Orders"
        value={String(totalOrders)}
        linkLabel="View all orders"
        linkHref="/app/orders"
        linkColor="text-[#ff5c35]"
        Icon={ShoppingBagIcon}
        iconBg="bg-orange-50"
        iconColor="text-[#ff5c35]"
        isLoading={isLoading}
      />
      <StatCard
        label="Active Orders"
        value={String(activeOrders)}
        linkLabel="Track progress"
        linkHref="/app/orders"
        linkColor="text-purple-600"
        Icon={FileTextIcon}
        iconBg="bg-purple-50"
        iconColor="text-purple-600"
        isLoading={isLoading}
      />
      <StatCard
        label="Total Spent"
        value={`GHS ${formattedSpent}`}
        compact
        linkLabel="View transactions"
        linkHref="/app/transactions"
        linkColor="text-emerald-600"
        Icon={BanknoteIcon}
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
        isLoading={isLoading}
      />
      <StatCard
        label="Delivered"
        value={String(deliveredOrders)}
        linkLabel="View history"
        linkHref="/app/orders"
        linkColor="text-blue-600"
        Icon={PackageOpenIcon}
        iconBg="bg-blue-50"
        iconColor="text-blue-600"
        isLoading={isLoading}
      />
    </div>
  );
}
