import type { Metadata } from "next";

import { ScanConsole } from "@/features/warehouse/components/scan-console";
import { WarehouseHeading } from "@/features/warehouse/components/warehouse-ui";
import { GuideLink } from "@/features/warehouse/guide/components/guide-link";

export const metadata: Metadata = { title: "Scan" };

/** `/warehouse/scan` — point, pull the trigger, or type (081). */
export default function WarehouseScanPage() {
  return (
    <div className="flex flex-col gap-6">
      <WarehouseHeading
        kicker="Look up"
        title="Scan a label"
        blurb="Scan a package label to see what is inside, an order's TM-number, or the carrier barcode on a parcel from a store to find the order it belongs to."
        action={<GuideLink section="scanning">Camera not working?</GuideLink>}
      />
      <ScanConsole />
    </div>
  );
}
