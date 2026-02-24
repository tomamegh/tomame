"use client";

import { OrderCard } from "./order-card";
import { EmptyOrders } from "./empty-orders";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { useOrders } from "../hooks";


export function OrdersList() {
  const { data, isPending, error } = useOrders();

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
        <CardContent>
          {error.message}
        </CardContent>
      </Card>
    );
  }

  if (!data || !data?.orders.length) {
    return <EmptyOrders />;
  }

  return (
    <div className="space-y-4 bg-white">
      {data.orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </div>
  );
}
