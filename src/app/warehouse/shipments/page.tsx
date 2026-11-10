import type { Metadata } from "next";
import Link from "next/link";
import { PhoneIcon } from "lucide-react";

import { ShipmentsBoard } from "@/features/warehouse/components/shipments-board";
import { WarehouseHeading } from "@/features/warehouse/components/warehouse-ui";
import { warehousePageUser } from "@/features/warehouse/services/page-user";
import { getShipmentBoard, getStageSettingsForStaff } from "@/features/warehouse/services/shipment.service";
import { listDriversForStaff } from "@/features/drivers/services/driver.service";

export const metadata: Metadata = { title: "Shipments" };
export const dynamic = "force-dynamic";

/** `/warehouse/shipments` — everything between the US hub and the customer's door (098). */
export default async function WarehouseShipmentsPage() {
  const user = await warehousePageUser("/warehouse/shipments");
  const [board, settings, drivers] = await Promise.all([
    getShipmentBoard(user),
    getStageSettingsForStaff(user),
    listDriversForStaff(user),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <WarehouseHeading
        kicker="After the hub"
        title="Shipments"
        blurb="Tick the packages or orders that moved together, then move them to the next step. Every customer inside is told, with the number to call."
        action={
          <Link
            href="/warehouse/stages"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-ink hover:bg-tm-paper"
          >
            <PhoneIcon className="size-4" aria-hidden />
            Steps and contacts
          </Link>
        }
      />
      <ShipmentsBoard board={board} settings={settings} drivers={drivers} />
    </div>
  );
}
