"use client";

import { useState } from "react";
import { ArrowRightIcon, ClockAlertIcon } from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import { journeyStageFor } from "@/features/orders/services/journey-stage";
import {
  nextMovableStage,
  type ShipmentStageKey,
  type StageSetting,
} from "@/features/shipments/stages";

import type { ShipmentOrder, WarehouseItem } from "../types";
import { formatShortDate, relativeInline } from "./format";
import { ShipmentUpdateDialog, type ShipmentUpdateMode } from "./shipment-update-dialog";

/**
 * One order's status, moved on its own (098). Bundled updates are the box and
 * the shipments board; this is the same set of updates for a single order, from
 * its page, while its box carries on. Every order ships in a box.
 *
 * Two lines, never merged: the ORDER STATUS (the state machine: Purchased, In
 * the air, Delivered) and the TRACKING step (where the parcel is). Each button
 * says which one it changes.
 */
export function ItemStatusPanel({
  item,
  shipment,
  settings,
  drivers = [],
}: {
  item: WarehouseItem;
  shipment: Omit<ShipmentOrder, "item">;
  settings: Record<ShipmentStageKey, StageSetting>;
  drivers?: Array<{ id: string; name: string; phone: string | null }>;
}) {
  const [mode, setMode] = useState<ShipmentUpdateMode | null>(null);

  const status = journeyStageFor(item.order_status).label;
  const stage = shipment.stage;
  const tracking = stage ? settings[stage].title : "Not started";
  const onTheWay = item.order_status === "in_transit";
  const next = onTheWay ? nextMovableStage(stage, item.recipient.kind === "pickup") : null;

  return (
    <section className="tm-up flex flex-col gap-4 rounded-[22px] border border-tm-border bg-card p-5 [animation-duration:0.5s] [animation-delay:.04s]">
      <h2 className="font-display text-[18px] leading-none font-bold text-tm-ink">Status</h2>

      <dl className="grid grid-cols-2 gap-2.5 sm:gap-3">
        <div className="rounded-[16px] bg-tm-paper p-3.5">
          <dt className="text-[11px] font-bold tracking-[0.12em] text-tm-text-3 uppercase">Order status</dt>
          <dd className="mt-1 text-[16px] font-bold text-tm-ink">{status}</dd>
        </div>
        <div className="rounded-[16px] bg-tm-paper p-3.5">
          <dt className="text-[11px] font-bold tracking-[0.12em] text-tm-text-3 uppercase">Tracking</dt>
          <dd className="mt-1 text-[16px] font-bold text-tm-ink">{tracking}</dd>
          {shipment.stage_at ? (
            <dd className="text-[12px] font-medium text-tm-text-3">{relativeInline(shipment.stage_at)}</dd>
          ) : null}
        </div>
      </dl>

      {shipment.notice ? (
        <div className="flex gap-2.5 rounded-[14px] bg-tm-amber-bg px-3.5 py-3 text-[13px] font-medium text-[#6B4708]">
          <ClockAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold break-words">{shipment.notice.message}</p>
            {shipment.notice.expected_on ? (
              <p className="mt-0.5 text-[12px]">New estimate {formatShortDate(`${shipment.notice.expected_on}T12:00:00Z`)}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {onTheWay ? (
        <div className="flex flex-wrap gap-2">
          {next ? (
            <AdminButton variant="primary" className="h-11 px-4" onClick={() => setMode("move")}>
              {settings[next].title}
              <ArrowRightIcon className="size-4" aria-hidden />
            </AdminButton>
          ) : null}
          {onTheWay ? (
            <AdminButton variant="secondary" className="h-11 px-4" onClick={() => setMode("delay")}>
              <ClockAlertIcon className="size-4" aria-hidden />
              Delay
            </AdminButton>
          ) : null}
          {onTheWay && shipment.notice ? (
            <AdminButton variant="quiet" className="h-11" onClick={() => setMode("clear")}>
              Clear delay
            </AdminButton>
          ) : null}
        </div>
      ) : null}

      {onTheWay && item.package ? (
        <p className="text-[12px] font-medium text-tm-text-3">
          This moves {item.order_no} alone. To move everything in {item.package.reference}, use the box or the Shipments board.
        </p>
      ) : null}

      <ShipmentUpdateDialog
        open={mode !== null}
        onOpenChange={(open) => !open && setMode(null)}
        mode={mode ?? "move"}
        settings={settings}
        suggestedStage={next}
        drivers={drivers}
        targets={{ package_ids: [], order_ids: [item.order_id], summary: `${item.order_no} · ${item.recipient.name ?? "Customer"}` }}
      />
    </section>
  );
}
