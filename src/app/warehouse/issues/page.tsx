import type { Metadata } from "next";
import { warehousePageUser } from "@/features/warehouse/services/page-user";

import type { OrderFeedbackStatus } from "@/db/queries/order-feedback";
import { IssuesBoard } from "@/features/warehouse/components/issues-board";
import { WarehouseHeading } from "@/features/warehouse/components/warehouse-ui";
import { listWarehouseIssues } from "@/features/warehouse/services/warehouse.service";

export const metadata: Metadata = { title: "Issues" };
export const dynamic = "force-dynamic";

const STATUSES: OrderFeedbackStatus[] = ["open", "in_review", "resolved", "dismissed"];

/**
 * `/warehouse/issues` — what customers said about their parcel photos (081).
 * This replaces `/admin/feedback`: the objection is about a box on this bench,
 * so it is worked by the people standing next to it.
 */
export default async function WarehouseIssuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await warehousePageUser("/warehouse/issues");
  const params = await searchParams;
  const status = STATUSES.find((s) => s === params.status) ?? "open";
  const issues = await listWarehouseIssues(user, status);

  return (
    <div className="flex flex-col gap-6">
      <WarehouseHeading
        kicker="Customer replies"
        title="Issues"
        blurb="Customers see the photos you take and can tell us something is wrong. Sort it while the parcel is still here. Once it flies, a mistake is expensive."
      />
      <IssuesBoard issues={issues} status={status} />
    </div>
  );
}
