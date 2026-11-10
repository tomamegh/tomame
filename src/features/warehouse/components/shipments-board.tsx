"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRightIcon, CheckIcon, ChevronDownIcon, ClockAlertIcon, PackageIcon, UsersIcon, XIcon } from "lucide-react";

import { AdminBadge, type AdminTone } from "@/components/layout/admin/admin-page";
import { AdminButton } from "@/components/layout/admin/controls";
import {
  STAFF_STAGE_LABEL,
  STAGE_RANK,
  daysSince,
  nextMovableStage,
  type ShipmentStageKey,
  type StageSetting,
} from "@/features/shipments/stages";
import { cn } from "@/lib/utils";

import type { ShipmentBoard, ShipmentOrder, WarehouseItem, WarehousePackage } from "../types";
import { formatRelative, pluralise, recipientPlace } from "./format";
import { CustomerRidesPanel } from "./customer-rides-panel";
import { ShipmentUpdateDialog, type ShipmentUpdateMode } from "./shipment-update-dialog";
import { ItemThumb } from "./warehouse-ui";

/**
 * The shipments board (098): every package and loose order between the US hub
 * and the customer's door, filtered by step. Tick what moved together — six
 * packages off one flight, or the twelve orders the rider took this morning —
 * and move them in one go. Customers are told once each.
 */

type Filter = "moving" | "departed" | "arrived_country" | "ghana_warehouse" | "last_mile" | "delivered";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "moving", label: "All on the way" },
  { key: "departed", label: "Dispatched" },
  { key: "arrived_country", label: "In customs" },
  { key: "ghana_warehouse", label: "Accra warehouse" },
  { key: "last_mile", label: "Pickup / delivery" },
  { key: "delivered", label: "Delivered (7 days)" },
];

const STAGE_TONE: Record<ShipmentStageKey, AdminTone> = {
  paid: "muted",
  purchased: "muted",
  hub_received: "muted",
  departed: "neutral",
  arrived_country: "amber",
  ghana_warehouse: "coral",
  ready_for_pickup: "coral",
  out_for_delivery: "coral",
  delivered: "green",
};

function inFilter(stage: ShipmentStageKey | null, filter: Filter): boolean {
  if (!stage) return false;
  switch (filter) {
    case "moving":
      return stage !== "delivered";
    case "last_mile":
      return stage === "ready_for_pickup" || stage === "out_for_delivery";
    default:
      return stage === filter;
  }
}

export function ShipmentsBoard({
  board,
  settings,
  drivers = [],
}: {
  board: ShipmentBoard;
  settings: Record<ShipmentStageKey, StageSetting>;
  drivers?: Array<{ id: string; name: string; phone: string | null }>;
}) {
  const [filter, setFilter] = useState<Filter>("moving");
  const [pickedPackages, setPickedPackages] = useState<Set<string>>(new Set());
  const [pickedOrders, setPickedOrders] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ShipmentUpdateMode | null>(null);

  const packages = board.packages.filter((p) => inFilter(p.stage, filter));
  const loose = board.loose.filter((o) => inFilter(o.stage, filter));
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [
          f.key,
          board.packages.filter((p) => inFilter(p.stage, f.key)).length +
            board.loose.filter((o) => inFilter(o.stage, f.key)).length,
        ]),
      ) as Record<Filter, number>,
    [board],
  );

  // 098: an order can be ticked on its own, loose or inside a box. An order
  // inside a box that is itself ticked moves with the box and is not sent twice.
  const inBox = useMemo(() => {
    const map = new Map<string, { item: WarehouseItem; pkgId: string }>();
    for (const p of board.packages) for (const l of p.lines) if (l.item) map.set(l.item.order_id, { item: l.item, pkgId: p.id });
    return map;
  }, [board]);
  const selectedPackages = board.packages.filter((p) => pickedPackages.has(p.id));
  const selectedLoose = board.loose.filter((o) => pickedOrders.has(o.item.order_id));
  const selectedInner = [...pickedOrders]
    .map((id) => inBox.get(id))
    .filter((x): x is { item: WarehouseItem; pkgId: string } => !!x && !pickedPackages.has(x.pkgId));
  const singleOrderIds = [...selectedLoose.map((o) => o.item.order_id), ...selectedInner.map((x) => x.item.order_id)];
  const selectionCount = selectedPackages.length + singleOrderIds.length;
  const orderCount =
    selectedPackages.reduce((n, p) => n + p.lines.filter((l) => l.item).length, 0) + singleOrderIds.length;
  const customerCount = new Set([
    ...selectedPackages.flatMap((p) => p.lines.flatMap((l) => (l.item ? [l.item.customer_key] : []))),
    ...selectedLoose.map((o) => o.item.customer_key),
    ...selectedInner.map((x) => x.item.customer_key),
  ]).size;

  // The step after the furthest-behind thing selected: moving a mixed selection
  // forward never skips the one that is lagging.
  const selectedStages = [
    ...selectedPackages.map((p) => p.stage),
    ...selectedLoose.map((o) => o.stage),
    ...selectedInner.map((x) => board.order_stages[x.item.order_id] ?? null),
  ].filter((s): s is ShipmentStageKey => !!s);
  const slowest = selectedStages.sort((a, b) => STAGE_RANK[a] - STAGE_RANK[b])[0] ?? null;
  const allPickup =
    selectedPackages.every((p) => p.recipients.every((r) => r.kind === "pickup")) &&
    selectedLoose.every((o) => o.item.recipient.kind === "pickup") &&
    selectedInner.every((x) => x.item.recipient.kind === "pickup");
  const suggested = nextMovableStage(slowest, allPickup);
  const anyNotice = selectedPackages.some((p) => p.notice) || selectedLoose.some((o) => o.notice);

  const clear = () => {
    setPickedPackages(new Set());
    setPickedOrders(new Set());
  };
  const toggle = (set: Set<string>, id: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };
  const allVisiblePicked =
    packages.length + loose.length > 0 &&
    packages.every((p) => pickedPackages.has(p.id)) &&
    loose.every((o) => pickedOrders.has(o.item.order_id));
  const pickAllVisible = () => {
    if (allVisiblePicked) return clear();
    setPickedPackages(new Set(packages.map((p) => p.id)));
    setPickedOrders(new Set(loose.map((o) => o.item.order_id)));
  };

  return (
    <div className="flex flex-col gap-5 pb-28">
      <CustomerRidesPanel rides={board.rides} />

      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Filter by step">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
              filter === f.key ? "border-tm-ink bg-tm-ink text-white" : "border-tm-border bg-card text-tm-text-2 hover:text-tm-ink",
            )}
          >
            {f.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] leading-none font-bold",
                filter === f.key ? "bg-white/20 text-white" : "bg-tm-paper text-tm-text-3",
              )}
            >
              {counts[f.key]}
            </span>
          </button>
        ))}
      </nav>

      {packages.length + loose.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[22px] border border-dashed border-tm-border bg-card px-6 py-14 text-center">
          <PackageIcon className="size-8 text-tm-text-3" aria-hidden />
          <p className="text-[14px] font-semibold text-tm-ink">Nothing at this step</p>
          <p className="max-w-[44ch] text-[13px] font-medium text-tm-text-2">
            Packages appear here once they ship from the US hub. Orders sent without a package show up too.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={pickAllVisible}
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-tm-text-2 hover:text-tm-ink"
            >
              <Tick on={allVisiblePicked} />
              {allVisiblePicked ? "Clear selection" : "Select all shown"}
            </button>
          </div>

          {packages.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[12px] font-bold tracking-[0.12em] text-tm-text-3 uppercase">Packages</h2>
              <ul className="flex flex-col gap-2">
                {packages.map((pkg) => (
                  <PackageRow
                    key={pkg.id}
                    pkg={pkg}
                    picked={pickedPackages.has(pkg.id)}
                    onToggle={() => toggle(pickedPackages, pkg.id, setPickedPackages)}
                    pickedOrders={pickedOrders}
                    onToggleOrder={(id) => toggle(pickedOrders, id, setPickedOrders)}
                    orderStages={board.order_stages}
                    typicalDays={pkg.stage ? settings[pkg.stage].typical_days : null}
                  />
                ))}
              </ul>
            </section>
          )}

          {loose.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[12px] font-bold tracking-[0.12em] text-tm-text-3 uppercase">Orders not in a package</h2>
              <ul className="flex flex-col gap-2">
                {loose.map((order) => (
                  <LooseRow
                    key={order.item.order_id}
                    order={order}
                    picked={pickedOrders.has(order.item.order_id)}
                    onToggle={() => toggle(pickedOrders, order.item.order_id, setPickedOrders)}
                    typicalDays={order.stage ? settings[order.stage].typical_days : null}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {selectionCount > 0 && (
        <div
          className="fixed inset-x-0 bottom-[calc(100px+env(safe-area-inset-bottom))] z-40 px-3 md:bottom-6"
          role="region"
          aria-label="Selected shipments"
        >
          <div className="tm-up mx-auto flex max-w-[860px] flex-wrap items-center gap-2 rounded-[20px] bg-tm-ink px-4 py-3 text-white shadow-[0_24px_50px_-20px_rgba(43,36,34,0.7)] [animation-duration:0.3s]">
            <button type="button" onClick={clear} aria-label="Clear selection" className="rounded-full p-1 hover:bg-white/10">
              <XIcon className="size-4" aria-hidden />
            </button>
            <span className="mr-auto text-[13px] font-semibold">
              {summaryText(selectedPackages.length, orderCount, customerCount)}
            </span>
            {anyNotice && (
              <AdminButton variant="quiet" onClick={() => setMode("clear")} className="text-white hover:bg-white/10">
                Clear delay
              </AdminButton>
            )}
            <AdminButton variant="secondary" onClick={() => setMode("delay")}>
              <ClockAlertIcon className="size-4" aria-hidden />
              Delay
            </AdminButton>
            <AdminButton variant="primary" onClick={() => setMode("move")} disabled={slowest === "delivered"}>
              {suggested ? settings[suggested].title : "Move"}
              <ArrowRightIcon className="size-4" aria-hidden />
            </AdminButton>
          </div>
        </div>
      )}

      <ShipmentUpdateDialog
        open={mode !== null}
        onOpenChange={(open) => !open && setMode(null)}
        mode={mode ?? "move"}
        settings={settings}
        suggestedStage={suggested}
        targets={{
          package_ids: selectedPackages.map((p) => p.id),
          order_ids: singleOrderIds,
          summary: summaryText(selectedPackages.length, orderCount, customerCount),
        }}
        onDone={clear}
        drivers={drivers}
      />
    </div>
  );
}

function summaryText(packages: number, orders: number, customers: number): string {
  return [
    packages ? pluralise(packages, "package") : null,
    pluralise(orders, "order"),
    pluralise(customers, "customer"),
  ]
    .filter(Boolean)
    .join(" · ");
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
        on ? "border-tm-coral bg-tm-coral text-white" : "border-tm-border bg-card",
      )}
      aria-hidden
    >
      {on ? <CheckIcon className="size-3.5" strokeWidth={3} /> : null}
    </span>
  );
}

function StageLine({
  stage,
  at,
  typicalDays,
  notice,
}: {
  stage: ShipmentStageKey | null;
  at: string | null;
  typicalDays: number | null;
  notice: { message: string; expected_on: string | null } | null;
}) {
  const days = daysSince(at);
  const overdue = stage !== "delivered" && typicalDays !== null && days !== null && days > typicalDays && !notice;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {stage ? <AdminBadge tone={STAGE_TONE[stage]}>{STAFF_STAGE_LABEL[stage]}</AdminBadge> : null}
      {at ? <span className="text-[12px] font-medium text-tm-text-3">{formatRelative(at)}</span> : null}
      {overdue ? <AdminBadge tone="coral">Overdue · day {days}</AdminBadge> : null}
      {notice ? (
        <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-tm-amber-bg px-2 py-0.5 text-[11.5px] font-semibold text-[#8A5A0A]">
          <ClockAlertIcon className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{notice.message}</span>
        </span>
      ) : null}
    </div>
  );
}

function PackageRow({
  pkg,
  picked,
  onToggle,
  pickedOrders,
  onToggleOrder,
  orderStages,
  typicalDays,
}: {
  pkg: WarehousePackage;
  picked: boolean;
  onToggle: () => void;
  pickedOrders: Set<string>;
  onToggleOrder: (orderId: string) => void;
  orderStages: Record<string, ShipmentStageKey | null>;
  typicalDays: number | null;
}) {
  const [open, setOpen] = useState(false);
  const items = pkg.lines.flatMap((l) => (l.item ? [l.item] : []));
  const behind = items.filter((i) => {
    const s = orderStages[i.order_id];
    return pkg.stage && s && STAGE_RANK[s] < STAGE_RANK[pkg.stage];
  }).length;
  const place = pkg.recipients[0] ? recipientPlace(pkg.recipients[0]) : null;

  return (
    <li
      className={cn(
        "flex flex-col rounded-[18px] border bg-card transition-colors",
        picked ? "border-tm-coral bg-tm-tint/40" : "border-tm-border",
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <button type="button" onClick={onToggle} aria-pressed={picked} aria-label={`Select ${pkg.reference}`} className="p-1">
          <Tick on={picked} />
        </button>
        <div className="flex -space-x-3">
          {items.slice(0, 3).map((item) => (
            <ItemThumb key={item.order_id} item={item} size={40} rounded={12} className="ring-2 ring-card" />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Link href={`/warehouse/packages/${pkg.id}`} className="font-mono text-[14.5px] font-bold text-tm-ink hover:underline">
              {pkg.reference}
            </Link>
            <span className="text-[12px] font-medium text-tm-text-3">
              {pluralise(items.length, "order")}
              {pkg.is_consolidated ? (
                <>
                  {" · "}
                  <UsersIcon className="inline size-3 align-[-1px]" aria-hidden /> {pkg.recipients.length}
                </>
              ) : place ? (
                ` · ${place}`
              ) : null}
              {pkg.service === "sea" ? " · Sea" : ""}
            </span>
          </div>
          <StageLine stage={pkg.stage} at={pkg.stage_at} typicalDays={typicalDays} notice={pkg.notice} />
          {behind > 0 && (
            <span className="text-[12px] font-medium text-tm-text-3">
              {pluralise(behind, "order")} inside {behind === 1 ? "is" : "are"} a step behind (on hold or added late).
            </span>
          )}
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} the orders in ${pkg.reference}`}
            className="flex h-10 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold text-tm-text-2 hover:bg-tm-paper"
          >
            <span className="hidden sm:inline">Orders</span>
            <ChevronDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        )}
      </div>
      {open && (
        <ul className="divide-y divide-tm-hairline border-t border-tm-hairline">
          {items.map((item) => {
            const on = picked || pickedOrders.has(item.order_id);
            const stage = orderStages[item.order_id] ?? null;
            return (
              <li key={item.order_id}>
                <button
                  type="button"
                  onClick={() => onToggleOrder(item.order_id)}
                  disabled={picked}
                  aria-pressed={on}
                  aria-label={`Select ${item.order_no} on its own`}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:cursor-default"
                >
                  <Tick on={on} />
                  <ItemThumb item={item} size={36} rounded={10} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-semibold text-tm-ink">
                      <span className="font-mono">{item.order_no}</span> · {item.title}
                    </span>
                    <span className="truncate text-[12px] font-medium text-tm-text-3">{item.recipient.name ?? "Customer"}</span>
                  </span>
                  {stage ? <AdminBadge tone={STAGE_TONE[stage]}>{STAFF_STAGE_LABEL[stage]}</AdminBadge> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function LooseRow({
  order,
  picked,
  onToggle,
  typicalDays,
}: {
  order: ShipmentOrder;
  picked: boolean;
  onToggle: () => void;
  typicalDays: number | null;
}) {
  const { item } = order;
  const place = recipientPlace(item.recipient);
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-[18px] border bg-card p-3 transition-colors",
        picked ? "border-tm-coral bg-tm-tint/40" : "border-tm-border",
      )}
    >
      <button type="button" onClick={onToggle} aria-pressed={picked} aria-label={`Select ${item.order_no}`} className="p-1">
        <Tick on={picked} />
      </button>
      <ItemThumb item={item} size={40} rounded={12} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <Link href={`/warehouse/items/${item.order_id}`} className="font-mono text-[13.5px] font-bold text-tm-ink hover:underline">
            {item.order_no}
          </Link>
          <span className="min-w-0 truncate text-[13px] font-medium text-tm-text-2">{item.title}</span>
        </div>
        <span className="text-[12px] font-medium text-tm-text-3">
          {[item.recipient.name, place].filter(Boolean).join(" · ")}
        </span>
        <StageLine stage={order.stage} at={order.stage_at} typicalDays={typicalDays} notice={order.notice} />
      </div>
    </li>
  );
}
