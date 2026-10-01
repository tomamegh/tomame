import type { Metadata } from "next";
import Link from "next/link";

import { AdminEmpty } from "@/components/layout/admin/admin-page";
import { InboundRow } from "@/features/warehouse/components/inbound";
import { WarehouseHeading } from "@/features/warehouse/components/warehouse-ui";
import { getInboundCounts, listInboundParcelViews } from "@/features/warehouse/services/inbound.service";
import { warehousePageUser } from "@/features/warehouse/services/page-user";
import { INBOUND_LATE_DAYS, type InboundStatus } from "@/features/warehouse/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inbound" };
export const dynamic = "force-dynamic";

const TABS: Array<{ status: InboundStatus; label: string; empty: string }> = [
  { status: "expected", label: "Expected", empty: "No store parcels are on their way. Add a tracking number on an order after buying it." },
  { status: "unmatched", label: "Unmatched", empty: "Every parcel that arrived belongs to an order." },
  { status: "arrived", label: "Arrived", empty: "No store parcels have been scanned in yet." },
];

/**
 * `/warehouse/inbound` — store parcels (086): what is on its way and how long it
 * has been, what arrived that nobody claimed, and what came in recently.
 */
export default async function WarehouseInboundPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await warehousePageUser("/warehouse/inbound");
  const params = await searchParams;
  const tab = TABS.find((t) => t.status === params.tab) ?? TABS[0]!;
  const [counts, parcels] = await Promise.all([
    getInboundCounts(user),
    listInboundParcelViews(user, tab.status, 200),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <WarehouseHeading
        kicker="Inbound"
        title="Store parcels"
        blurb={`Every tracking number the stores gave us, matched to the order inside. Expected for more than ${INBOUND_LATE_DAYS} days means chase the store.`}
        action={
          <Link
            href="/warehouse/scan"
            className="tm-cta-gradient inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold text-white"
          >
            Scan a parcel
          </Link>
        }
      />

      <nav aria-label="Inbound" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.status}
            href={`/warehouse/inbound?tab=${t.status}`}
            aria-current={t.status === tab.status ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors",
              t.status === tab.status ? "bg-tm-ink text-white" : "border border-tm-border bg-card text-tm-text-2 hover:text-tm-ink",
            )}
          >
            {t.label}
            <span className="tm-nums text-[12px] opacity-75">{counts[t.status]}</span>
            {t.status === "expected" && counts.late > 0 ? (
              <span className="rounded-full bg-tm-coral px-1.5 py-0.5 text-[10.5px] leading-none font-bold text-white">
                {counts.late} late
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      {parcels.length === 0 ? (
        <AdminEmpty title={`Nothing ${tab.label.toLowerCase()}`} body={tab.empty} />
      ) : (
        <ul className="tm-up flex flex-col divide-y divide-tm-hairline overflow-hidden rounded-[22px] border border-tm-border bg-card [animation-duration:0.5s]">
          {parcels.map((parcel) => (
            <li key={parcel.id}>
              <InboundRow parcel={parcel} late={parcel.status === "expected" && parcel.age_days > INBOUND_LATE_DAYS} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
