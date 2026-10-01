import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { UnmatchedScan } from "@/features/warehouse/components/inbound";
import { WarehouseHeading } from "@/features/warehouse/components/warehouse-ui";
import { CARRIER_LABELS, formatTracking, normaliseTracking } from "@/features/warehouse/inbound/tracking-number";
import { findInboundParcelId, toOrderRef } from "@/features/warehouse/services/inbound.service";
import { warehousePageUser } from "@/features/warehouse/services/page-user";
import { listWarehouseItems } from "@/features/warehouse/services/warehouse.service";
import { inboundParcelPath } from "@/features/warehouse/types";

export const metadata: Metadata = { title: "New parcel" };
export const dynamic = "force-dynamic";

/**
 * `/warehouse/inbound/new?code=…` — the scan found a carrier barcode nobody
 * registered (086). Link it to its order, or log it as unmatched.
 */
export default async function WarehouseInboundNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await warehousePageUser("/warehouse/inbound/new");
  const params = await searchParams;
  const tracking = typeof params.code === "string" ? normaliseTracking(params.code) : null;
  if (!tracking) redirect("/warehouse/scan");

  // Registered while the operator was on the way here: open that one instead.
  const existing = await findInboundParcelId(user, tracking.candidates);
  if (existing) redirect(inboundParcelPath(existing));

  const bench = await listWarehouseItems(user);
  const candidates = bench.filter((i) => i.stage === "awaiting" || i.stage === "received").map(toOrderRef);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/warehouse/scan"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-tm-text-2 transition-colors hover:text-tm-ink"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        Scan
      </Link>
      <WarehouseHeading
        kicker="Not expected"
        title="Whose parcel is this?"
        blurb="Nobody added this tracking number to an order. Link it to the right one and it is logged in like any other."
      />
      <UnmatchedScan
        code={tracking.key}
        display={formatTracking(tracking.key)}
        carrierLabel={CARRIER_LABELS[tracking.carrier]}
        candidates={candidates}
      />
    </div>
  );
}
