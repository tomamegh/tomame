"use client";

import { OrderCard } from "./order-card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { HandbagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Order } from "../types";

function OrderSkeletonCard() {
  return (
    <>
      {/* Mobile skeleton */}
      <div className="lg:hidden flex items-center gap-4 rounded-2xl border border-stone-100 bg-white p-3.5">
        <Skeleton className="shrink-0 size-14 rounded-lg" />
        <div className="flex-1 space-y-2.5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-14 rounded-md" />
            <Skeleton className="h-4 w-20 rounded-md" />
          </div>
          <Skeleton className="h-4 w-3/4 rounded-md" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-3 w-12 rounded-md" />
          </div>
        </div>
        <Skeleton className="shrink-0 size-4 rounded" />
      </div>
      {/* Desktop skeleton */}
      <div className="hidden md:flex items-center gap-5 rounded-2xl border border-stone-100 bg-white p-5">
        <Skeleton className="shrink-0 size-18 rounded-xl" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-16 rounded-md" />
          <Skeleton className="h-5 w-2/3 rounded-md" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-3 w-16 rounded-md" />
          </div>
        </div>
        <div className="hidden xl:flex flex-col gap-2 px-5 border-l border-stone-50">
          <Skeleton className="h-3 w-8 rounded" />
          <Skeleton className="h-5 w-20 rounded" />
        </div>
        <div className="hidden md:block flex-1 xl:max-w-sm xl:px-4">
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
        <Skeleton className="size-9 rounded-xl shrink-0" />
      </div>
    </>
  );
}

interface OrdersListProps {
  variant?: "all" | "recent";
  orders: Order[];
  isLoading?: boolean;
  error?: Error | null;
  triggerFunction?: () => void;
}

export function OrdersList({
  variant = "all",
  orders = [],
  isLoading,
  error,
  triggerFunction,
}: OrdersListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <OrderSkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
        <CardContent>{error.message}</CardContent>
      </Card>
    );
  }

  if (!orders?.length) {
    return (
      <Empty className="bg-white">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HandbagIcon />
          </EmptyMedia>
          <EmptyTitle>No orders yet</EmptyTitle>
          <EmptyDescription>
            Paste a product URL above to place your first order.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="primary"
            size="sm"
            className="px-5"
            onClick={() => triggerFunction?.()}
          >
            Refresh
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {(variant === "all" ? orders : orders.slice(0, 4)).map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </div>
  );
}
