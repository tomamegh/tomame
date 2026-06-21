"use client";
import { useOrders } from "@/features/orders/hooks";
import { HeroSection } from "@/features/orders/components/hero-section";
import { StatsRow } from "@/features/orders/components/stats-row";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { UserOrdersTable } from "@/features/orders/components/user-orders";

export default function DashboardPage() {
  const { data: orders = [], isPending } = useOrders();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="space-y-10 pb-10">
      <HeroSection />
      <StatsRow orders={orders} isLoading={isPending} />
      <motion.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium tracking-tight text-stone-800">
            Recent Orders
          </h2>
          <Link
            href="/app/orders"
            className="text-sm font-medium text-orange-500 hover:text-orange-600"
          >
            View all
          </Link>
        </div>
        {/* <OrdersList orders={orders} isLoading={isPending} error={error} /> */}
        <UserOrdersTable />
      </motion.div>
    </div>
  );
}
