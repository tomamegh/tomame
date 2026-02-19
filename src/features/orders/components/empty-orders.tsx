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
          Upload files to your cloud storage to access them anywhere.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm">
          Upload Files
        </Button>
      </EmptyContent>
    </Empty>
  );
}