import { warehousePageUser } from "@/features/warehouse/services/page-user";

import { isBoardStage } from "@/features/warehouse/board/stage";
import { OrderBoardView, type BoardGroup } from "@/features/warehouse/components/order-board";
import { GuideTourCard } from "@/features/warehouse/guide/components/guide-tour-card";
import { WarehouseHeading } from "@/features/warehouse/components/warehouse-ui";
import { getOrderBoard } from "@/features/warehouse/services/board.service";
import { getStageSettingsForStaff } from "@/features/warehouse/services/shipment.service";
import { countOpenWarehouseIssues, listWarehousePackages } from "@/features/warehouse/services/warehouse.service";
import { listDriversForStaff } from "@/features/drivers/services/driver.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";

export const dynamic = "force-dynamic";

const GROUPS: BoardGroup[] = ["customer", "checkout", "none"];
/** Old links (`?tab=expected`) land on the stage they meant. */
const TAB_STAGE = { expected: "on_way", hub: "at_hub", boxes: "boxed" } as const;

/**
 * `/warehouse` — every order from paid to delivered, by stage (2026-11).
 *
 * One read (`getOrderBoard`) feeds the strip's counts and the lists, so they
 * cannot disagree. Buying, tracking, receiving, packing and the Ghana legs all
 * start here, one order at a time or in bulk.
 */
export default async function WarehouseHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await warehousePageUser("/warehouse");
  const params = await searchParams;
  const tab = typeof params.tab === "string" && params.tab in TAB_STAGE ? TAB_STAGE[params.tab as keyof typeof TAB_STAGE] : null;
  const stage = isBoardStage(params.stage) ? params.stage : tab;
  const group = GROUPS.find((g) => g === params.group) ?? null;

  const [board, openBoxes, issues, settings, drivers] = await Promise.all([
    getOrderBoard(user),
    listWarehousePackages(user, { statuses: ["packing"], limit: 100 }),
    countOpenWarehouseIssues(user),
    getStageSettingsForStaff(user),
    listDriversForStaff(user),
  ]);
  const firstName = user.profile?.first_name?.trim() || null;

  return (
    // Bottom room so the action bar never covers the last row or the guide card.
    <div className="flex flex-col gap-4 pb-36 md:pb-28">
      <div className="hidden md:block">
        <WarehouseHeading
          kicker={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Accra" })}
          title={firstName ? `Hi, ${firstName}` : "Orders"}
        />
      </div>
      <OrderBoardView
        board={board}
        openBoxes={openBoxes}
        isAdmin={canAccessAdmin(user)}
        issues={issues}
        settings={settings}
        drivers={drivers}
        initialStage={stage}
        initialGroup={group}
      />
      <GuideTourCard />
    </div>
  );
}
