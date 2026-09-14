import type { Metadata } from "next";

import { AdminPage, AdminStat } from "@/components/layout/admin/admin-page";
import { listAdminBoxes } from "@/db/queries/admin-boxes";
import type { BoxStatus } from "@/db/queries/consolidation-boxes";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import { listRegions } from "@/db/queries/regions";
import {
  describeBoxFill,
  isPastCutoff,
} from "@/features/bag/components/admin-bag-format";
import { AdminBoxesBoard } from "@/features/bag/components/admin-boxes-board";
import type { BoxConstants } from "@/features/bag/services/box-packing";
import {
  AdminFilterPills,
  type AdminFilterPill,
} from "@/components/layout/admin";
import { formatAdminDateTime } from "@/features/orders/components/admin-order-display";

export const metadata: Metadata = { title: "Boxes · Tomame admin" };

/**
 * `/admin/boxes` — the consolidation boxes items are packed into.
 *
 * NEW IN THIS PASS: `consolidation_boxes` (048) has never had a screen. The two
 * things an operator has to be able to see are how full a box is against its
 * capacity, and whether it is past the cutoff and still open — because nothing
 * closes a box automatically, and an open box past its cutoff goes on collecting
 * lines that will miss the flight.
 *
 * The capacity and the chargeable-weight rules come from `pricing_constants` and
 * `box-packing.ts`, never from a literal on this page. `box_capacity_lbs` is
 * only a default here — each box stores the capacity it was opened with, and the
 * meter is drawn against the box's own.
 */
export default async function AdminBoxesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = resolveStatus(params.status);

  const [boxes, constantsMap, regions] = await Promise.all([
    listAdminBoxes({ status }),
    getPricingConstantsMap(),
    listRegions(),
  ]);

  const constants: BoxConstants = {
    box_capacity_lbs: constantsMap.box_capacity_lbs ?? 0,
    consolidation_saving_pct: constantsMap.consolidation_saving_pct ?? 0,
    minimum_chargeable_weight_lbs: constantsMap.minimum_chargeable_weight_lbs ?? 0,
  };
  const regionNames = new Map(regions.map((region) => [region.code, region.name]));

  const now = new Date();
  const overdue = boxes.filter(
    (box) => box.status === "open" && isPastCutoff(box, now),
  ).length;
  const packedItems = boxes.reduce((sum, box) => sum + box.items.length, 0);
  const unweighed = boxes.reduce(
    (sum, box) => sum + describeBoxFill(box, box.items, constants).unweighedCount,
    0,
  );
  // The soonest departure still ahead of us. `listAdminBoxes` already orders by
  // `departs_at`, so this is the first one that has not already flown.
  const nextDeparture = boxes.find(
    (box) => box.departs_at && Date.parse(box.departs_at) > now.getTime(),
  );

  const pills: AdminFilterPill[] = [
    { label: "All", href: "/admin/boxes", active: !status },
    ...BOX_STATUSES.map((option) => ({
      label: option.label,
      href: `/admin/boxes?status=${option.value}`,
      active: status === option.value,
    })),
  ];

  return (
    <AdminPage
      title="Boxes"
      blurb="How items are consolidated for a lane — what is in each box, how full it is, and when it leaves."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          index={0}
          label={status ? BOX_STATUS_LABEL[status] : "Boxes"}
          value={String(boxes.length)}
          detail={`${packedItems} ${packedItems === 1 ? "item" : "items"} packed`}
          tone={boxes.length > 0 ? "coral" : "muted"}
        />
        <AdminStat
          index={1}
          label="Past cutoff"
          value={String(overdue)}
          detail={
            overdue > 0
              ? "Still open — nothing closes a box on its own"
              : "Every open box is still inside its cutoff"
          }
          tone={overdue > 0 ? "amber" : "green"}
        />
        <AdminStat
          index={2}
          label="Unweighed items"
          value={String(unweighed)}
          detail={
            unweighed > 0
              ? "Counted at 0 lb, so every meter reads low"
              : "Every packed item has a weight"
          }
          tone={unweighed > 0 ? "amber" : "green"}
        />
        <AdminStat
          index={3}
          label="Next departure"
          value={
            nextDeparture?.departs_at
              ? (formatAdminDateTime(nextDeparture.departs_at) ?? "Not scheduled")
              : "Not scheduled"
          }
          detail={
            nextDeparture
              ? (regionNames.get(nextDeparture.region_code) ?? nextDeparture.region_code)
              : "No box ahead of us has a departure date"
          }
          tone={nextDeparture ? "neutral" : "muted"}
        />
      </div>

      <AdminFilterPills pills={pills} label="Filter boxes by status" />

      <AdminBoxesBoard
        boxes={boxes}
        constants={constants}
        regionNames={regionNames}
        now={now}
        emptyBody={
          status
            ? `No box is ${BOX_STATUS_LABEL[status].toLowerCase()} right now.`
            : "No consolidation box has been opened yet. The bag opens one the first time a customer's lines need packing for a region."
        }
      />
    </AdminPage>
  );
}

const BOX_STATUSES = [
  { value: "open" as const, label: "Open" },
  { value: "closed" as const, label: "Closed" },
  { value: "in_transit" as const, label: "In the air" },
  { value: "landed" as const, label: "Landed" },
];

const BOX_STATUS_LABEL: Record<BoxStatus, string> = {
  open: "Open boxes",
  closed: "Closed boxes",
  in_transit: "In the air",
  landed: "Landed",
};

/** An unrecognised status shows everything rather than nothing. */
function resolveStatus(value: string | string[] | undefined): BoxStatus | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return BOX_STATUSES.find((option) => option.value === raw)?.value;
}
