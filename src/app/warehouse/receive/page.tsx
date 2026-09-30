import type { Metadata } from "next";
import { warehousePageUser } from "@/features/warehouse/services/page-user";

import { ReceiveBench } from "@/features/warehouse/components/receive-bench";
import { WarehouseHeading } from "@/features/warehouse/components/warehouse-ui";
import { GuideLink } from "@/features/warehouse/guide/components/guide-link";
import {
  listWarehouseItems,
  listWarehousePackages,
} from "@/features/warehouse/services/warehouse.service";
import type { ItemStage } from "@/features/warehouse/types";

export const metadata: Metadata = { title: "Receive" };
export const dynamic = "force-dynamic";

const STAGES: ItemStage[] = ["awaiting", "received", "packed"];

/**
 * `/warehouse/receive` — every parcel the hub is expecting or holding (081).
 *
 * Logging a parcel in writes the customer's "At our US hub" event with the
 * weight the scale read, so this is also where tracking starts moving.
 */
export default async function WarehouseReceivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await warehousePageUser("/warehouse/receive");
  const params = await searchParams;
  const raw = typeof params.stage === "string" ? params.stage : undefined;
  const stage = STAGES.find((s) => s === raw) ?? "all";
  const query = typeof params.q === "string" ? params.q : "";

  const [items, packing] = await Promise.all([
    listWarehouseItems(user),
    listWarehousePackages(user, { statuses: ["packing"], limit: 30 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <WarehouseHeading
        kicker="Inbound"
        title="Receive & sort"
        blurb="Log each parcel in as it comes off the truck and weigh it. The customer sees it arrive. Then tick items for one person and pack them together."
        action={<GuideLink section="daily-flow">How receiving works</GuideLink>}
      />
      <ReceiveBench
        items={items.filter((i) => i.stage !== "shipped")}
        openPackages={packing.map((p) => ({ id: p.id, reference: p.reference, unit_count: p.unit_count, recipients: p.recipients.map((r) => r.name ?? "Customer") }))}
        initialStage={stage}
        initialQuery={query}
      />
    </div>
  );
}
