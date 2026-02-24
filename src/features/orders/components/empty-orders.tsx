import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { HandbagIcon } from "lucide-react";

export function EmptyOrders() {
  return (
    <Empty className="bg-white">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HandbagIcon />
        </EmptyMedia>
        <EmptyTitle>You have no orders</EmptyTitle>
        <EmptyDescription>
          You have no orders to show. Try reloading the page to see your new orders.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm">
          Reload
        </Button>
      </EmptyContent>
    </Empty>
  );
}