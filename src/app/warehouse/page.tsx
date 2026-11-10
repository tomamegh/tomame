import { warehousePageUser } from "@/features/warehouse/services/page-user";

import { OrdersWorkbench, type WorkbenchTab } from "@/features/warehouse/components/orders-workbench";
import { GuideTourCard } from "@/features/warehouse/guide/components/guide-tour-card";
import { WarehouseHeading } from "@/features/warehouse/components/warehouse-ui";
import {
  countOpenWarehouseIssues,
  listWarehouseItems,
  listWarehousePackages,
} from "@/features/warehouse/services/warehouse.service";

export const dynamic = "force-dynamic";

const TABS: WorkbenchTab[] = ["expected", "hub", "boxes"];

/**
 * `/warehouse` — the orders the hub has to act on (098).
 *
 * Opens on the work, not on boxes: purchased orders on their way (Expected),
 * parcels logged in and waiting to be boxed (At hub), then the boxes on the
 * bench (Boxes). Packing and shipping happen from here and the box page; this
 * is the only place an order's status moves now.
 */
export default async function WarehouseHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await warehousePageUser("/warehouse");
  const params = await searchParams;
  const tab = TABS.find((t) => t === params.tab) ?? null;
  const [items, boxes, issues] = await Promise.all([
    listWarehouseItems(user),
    listWarehousePackages(user, { statuses: ["packing", "sealed"], limit: 48 }),
    countOpenWarehouseIssues(user),
  ]);
  const firstName = user.profile?.first_name?.trim() || null;

  return (
    // Bottom room so the action bar never covers the last row or the guide card.
    <div className="flex flex-col gap-4 pb-36 md:pb-28">
      {/* On a phone the tabs are the title: the work starts above the fold. */}
      <div className="hidden md:block">
        <WarehouseHeading
          kicker={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Accra" })}
          title={firstName ? `Hi, ${firstName}` : "Orders"}
        />
      </div>
      <OrdersWorkbench
        items={items.filter((i) => (i.stage === "awaiting" || i.stage === "received") && !i.package)}
        boxes={boxes}
        initialTab={tab}
        attention={{ issues, held: items.filter((i) => i.held).length }}
      />
      {/* 081 guide: offered until this device has finished it or closed the card. Below the work, not above it. */}
      <GuideTourCard />
    </div>
  );
}
