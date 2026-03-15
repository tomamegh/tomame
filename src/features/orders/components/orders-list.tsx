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
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { useOrders } from "../hooks";
import { HandbagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OrdersList({ variant = "all" }: { variant?: "all" | "recent" }) {
  const { data, isPending, isFetching, error, refetch } = useOrders();

  if (isPending) {
    return (
      <Empty className="w-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner />
          </EmptyMedia>
          <EmptyTitle>Fetching your Orders</EmptyTitle>
          <EmptyDescription>
            Please wait while we fetch your orders. Do not refresh the page.
          </EmptyDescription>
        </EmptyHeader>
        {/* <EmptyContent>
        <Button variant="outline" size="sm">
          Cancel
        </Button>
      </EmptyContent> */}
      </Empty>
    );
  }

  if (error) {
    return (
      <Card className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
        <CardContent>{error.message}</CardContent>
      </Card>
    );
  }

  if (!data?.length) {
    return (
      <Empty className="bg-white">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HandbagIcon />
          </EmptyMedia>
          <EmptyTitle>You have no orders</EmptyTitle>
          <EmptyDescription>
            You have no orders to show. Try reloading the page to see your new
            orders.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="primary"
            size="sm"
            className="px-5"
            onClick={() => refetch()}
          >
            {isFetching && <Spinner />}
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="divide-y divide-stone-100 space-y-3">
      {(variant === "all" ? data : data.slice(0, 3)).map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </div>
  );
}
