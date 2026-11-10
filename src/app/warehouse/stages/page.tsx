import type { Metadata } from "next";

import { StageSettingsForm } from "@/features/warehouse/components/stage-settings-form";
import { WarehouseHeading } from "@/features/warehouse/components/warehouse-ui";
import { warehousePageUser } from "@/features/warehouse/services/page-user";
import { getStageSettingsForStaff } from "@/features/warehouse/services/shipment.service";
import { SHIPMENT_STAGE_KEYS } from "@/features/shipments/stages";
import { canAccessAdmin } from "@/lib/auth/admin-access";

export const metadata: Metadata = { title: "Steps and contacts" };
export const dynamic = "force-dynamic";

/** `/warehouse/stages` — each step's wording and who customers call about it (098). Admins edit. */
export default async function WarehouseStagesPage() {
  const user = await warehousePageUser("/warehouse/stages");
  const settings = await getStageSettingsForStaff(user);

  return (
    <div className="flex flex-col gap-6">
      <WarehouseHeading
        kicker="Shipments"
        title="Steps and contacts"
        blurb="What customers read at each step of their order, and the number they can call or WhatsApp about it. A contact set on a single update overrides the one here."
      />
      <StageSettingsForm
        settings={SHIPMENT_STAGE_KEYS.map((key) => settings[key])}
        editable={canAccessAdmin(user)}
      />
    </div>
  );
}
