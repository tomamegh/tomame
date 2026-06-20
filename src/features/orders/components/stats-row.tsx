"use client";

import Link from "next/link";
import {
  ShoppingBagIcon,
  FileTextIcon,
  BanknoteIcon,
  PackageOpenIcon,
  ArrowRightIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
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
    <Card className="group overflow-hidden rounded-2xl border border-stone-100 bg-white soft-shadow py-0 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
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
            <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
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

  const shouldReduceMotion = useReducedMotion();

  const cards = [
    {
      label: "Total Orders",
      value: String(totalOrders),
      linkLabel: "View all orders",
      linkHref: "/app/orders",
      linkColor: "text-orange-500",
      Icon: ShoppingBagIcon,
      iconBg: "bg-orange-50",
      iconColor: "text-orange-500",
    },
    {
      label: "Active Orders",
      value: String(activeOrders),
      linkLabel: "Track progress",
      linkHref: "/app/orders",
      linkColor: "text-purple-600",
      Icon: FileTextIcon,
      iconBg: "bg-purple-50",
      iconColor: "text-purple-600",
    },
    {
      label: "Total Spent",
      value: `GHS ${formattedSpent}`,
      compact: true,
      linkLabel: "View transactions",
      linkHref: "/app/transactions",
      linkColor: "text-emerald-600",
      Icon: BanknoteIcon,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
    {
      label: "Delivered",
      value: String(deliveredOrders),
      linkLabel: "View history",
      linkHref: "/app/orders",
      linkColor: "text-blue-600",
      Icon: PackageOpenIcon,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      aria-label="Order statistics"
    >
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.07 }}
        >
          <StatCard {...card} isLoading={isLoading} />
        </motion.div>
      ))}
    </div>
  );
}
