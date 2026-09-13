import Link from "next/link";

import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
} from "@/components/layout/admin/admin-page";
import type { AdminBoxItem, AdminBoxRow } from "@/db/queries/admin-boxes";
import type { BoxConstants } from "@/features/bag/services/box-packing";
import { formatAdminDateTime } from "@/features/orders/components/admin-order-display";
import {
  adminStatusLabel,
  adminStatusTone,
} from "@/features/orders/components/admin-transitions";
import { cn } from "@/lib/utils";
import {
  boxStatusTone,
  describeBoxFill,
  isPastCutoff,
  itemChargeableLbs,
} from "./admin-bag-format";

/**
 * Consolidation boxes — the packing unit a lane flies on.
 *
 * NEW IN THIS PASS. `consolidation_boxes` (048) has existed, been written to by
 * the bag, and been referenced by both `cart_items` and `orders`, with no screen
 * anywhere that could show an admin what was in one.
 *
 * THE WEIGHTS ARE THE PACKER'S OWN. `describeBoxFill` calls
 * `chargeableWeightLbs` from `box-packing.ts` — the same function the customer's
 * bag meter is drawn from — rather than re-deriving `max(listed, minimum) ×
 * quantity` here. If the two ever disagreed, the customer's "add one more and
 * save" promise and the admin's "this box is full" would be about different
 * boxes.
 *
 * An item with no known weight is counted at 0 lb and SAID, exactly as the
 * packer does it: a box that reads 40% full with four unweighed items in it is
 * not 40% full, and an operator about to close it needs to know that.
 */

export function AdminBoxesBoard({
  boxes,
  constants,
  regionNames,
  now,
  emptyBody,
}: {
  boxes: AdminBoxRow[];
  constants: BoxConstants;
  /** `regions.code` → `regions.name`, so a card says "United States", not "USA". */
  regionNames: Map<string, string>;
  now: Date;
  emptyBody: string;
}) {
  if (boxes.length === 0) {
    return (
      <AdminCard index={1}>
        <AdminEmpty title="No boxes" body={emptyBody} />
      </AdminCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {boxes.map((box, index) => (
        <BoxCard
          key={box.id}
          box={box}
          constants={constants}
          regionName={regionNames.get(box.region_code) ?? box.region_code}
          now={now}
          index={index + 1}
        />
      ))}
    </div>
  );
}

function BoxCard({
  box,
  constants,
  regionName,
  now,
  index,
}: {
  box: AdminBoxRow;
  constants: BoxConstants;
  regionName: string;
  now: Date;
  index: number;
}) {
  const fill = describeBoxFill(box, box.items, constants);
  const overdue = box.status === "open" && isPastCutoff(box, now);

  return (
    <AdminCard
      index={index}
      title={box.label ?? `${regionName} box`}
      blurb={`${regionName} · ${box.items.length} ${box.items.length === 1 ? "item" : "items"}`}
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          <AdminBadge tone={boxStatusTone(box.status)}>{BOX_STATUS_LABEL[box.status]}</AdminBadge>
          {/*
            Amber because nothing closes a box automatically: an open box past
            its cutoff will go on collecting lines that will miss the flight
            until a person closes it.
          */}
          {overdue ? <AdminBadge tone="amber">Past cutoff</AdminBadge> : null}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="tm-nums text-[13px] font-semibold text-tm-ink">
              {fill.chargeableLbs} of {box.capacity_lbs} lb
            </span>
            <span className="tm-nums text-[12.5px] font-medium text-tm-text-3">
              {fill.headroomLbs} lb spare
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-tm-paper"
            role="meter"
            aria-valuenow={fill.fillPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${box.label ?? regionName} fill`}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                fill.fillPct >= 100 ? "bg-tm-amber" : "bg-tm-coral",
              )}
              style={{ width: `${fill.fillPct}%` }}
            />
          </div>
          {fill.unweighedCount > 0 ? (
            <p className="text-[12px] leading-[1.5] font-medium text-tm-amber">
              {fill.unweighedCount} {fill.unweighedCount === 1 ? "item has" : "items have"} no
              listed weight and {fill.unweighedCount === 1 ? "was" : "were"} counted at 0 lb.
              The real fill is higher than the bar shows.
            </p>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-4 border-t border-tm-hairline pt-4 sm:grid-cols-4">
          <BoxFact
            label="Cutoff"
            value={formatAdminDateTime(box.cutoff_at)}
            fallback="Not scheduled"
            tone={overdue ? "amber" : undefined}
          />
          <BoxFact
            label="Departs"
            value={formatAdminDateTime(box.departs_at)}
            fallback="Not scheduled"
          />
          <BoxFact label="Paid for" value={String(fill.committedCount)} />
          <BoxFact
            label="Still in bags"
            value={String(fill.provisionalCount)}
            hint={fill.provisionalCount > 0 ? "May never be paid for" : undefined}
          />
        </dl>

        {box.items.length > 0 ? (
          <ul className="flex flex-col gap-2 border-t border-tm-hairline pt-4">
            {box.items.map((item) => (
              <BoxItemRow key={`${item.kind}-${item.id}`} item={item} constants={constants} />
            ))}
          </ul>
        ) : (
          <p className="border-t border-tm-hairline pt-4 text-[12.5px] leading-[1.5] font-medium text-tm-text-3">
            Nothing has been packed into this box yet.
          </p>
        )}
      </div>
    </AdminCard>
  );
}

function BoxItemRow({ item, constants }: { item: AdminBoxItem; constants: BoxConstants }) {
  // From the packer, so this line and the meter above it are computed by the
  // same function rather than by two spellings of the same arithmetic.
  const weight = itemChargeableLbs(item, constants);

  const body = (
    <>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="line-clamp-1 max-w-[48ch] text-[12.5px] leading-[1.35] font-semibold text-tm-ink">
          {item.title ?? item.product_url ?? "Product not recorded"}
        </span>
        <span className="text-[11.5px] leading-none font-medium text-tm-text-3">
          {item.kind === "order" ? (item.reference ?? "Paid order") : "Still in a customer's bag"}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="tm-nums text-[12px] font-medium text-tm-text-2">× {item.quantity}</span>
        <span className="tm-nums text-[12.5px] font-semibold text-tm-ink">
          {weight != null ? `${weight} lb` : "no weight"}
        </span>
        {item.order_status ? (
          <AdminBadge tone={adminStatusTone(item.order_status)}>
            {adminStatusLabel(item.order_status)}
          </AdminBadge>
        ) : (
          <AdminBadge tone="muted">Unpaid</AdminBadge>
        )}
      </div>
    </>
  );

  return (
    <li>
      {item.kind === "order" ? (
        <Link
          href={`/admin/orders/${item.id}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-tm-paper px-3 py-2 transition-colors hover:bg-tm-tint"
        >
          {body}
        </Link>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-tm-paper px-3 py-2">
          {body}
        </div>
      )}
    </li>
  );
}

const BOX_STATUS_LABEL: Record<AdminBoxRow["status"], string> = {
  open: "Open",
  closed: "Closed",
  in_transit: "In the air",
  landed: "Landed",
};

function BoxFact({
  label,
  value,
  fallback,
  hint,
  tone,
}: {
  label: string;
  value: string | null;
  fallback?: string;
  hint?: string;
  tone?: "amber";
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11.5px] leading-none font-semibold text-tm-text-2">{label}</dt>
      <dd
        className={cn(
          "tm-nums text-[13px] leading-[1.35] font-semibold",
          !value ? "text-tm-text-3" : tone === "amber" ? "text-tm-amber" : "text-tm-ink",
        )}
      >
        {value ?? fallback ?? "—"}
      </dd>
      {hint ? (
        <span className="text-[11px] leading-[1.3] font-medium text-tm-text-3">{hint}</span>
      ) : null}
    </div>
  );
}
