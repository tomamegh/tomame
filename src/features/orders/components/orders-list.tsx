"use client";

import { MobileOrderCard, OrderCard } from "./order-card";
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
import { HandbagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Order } from "../types";

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

  if (!orders?.length) {
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
            onClick={() => {
              triggerFunction?.();
            }}
          >
            {isLoading && <Spinner />}
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {(variant === "all" ? orders : orders.slice(0, 3)).map((order) => (
        <div key={order.id}>
          <div className="lg:hidden">
            <MobileOrderCard order={order} />
          </div>
          <div className="hidden lg:block">
            <OrderCard order={order} variant="detailed" />
          </div>
        </div>
      ))}
    </div>
  );
}
