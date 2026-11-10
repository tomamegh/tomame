"use client";

import { useState } from "react";
import { ArrowRightIcon, CheckIcon, ClockAlertIcon } from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import {
  STAGE_RANK,
  nextMovableStage,
  type MovableStage,
  type ShipmentStageKey,
  type StageSetting,
} from "@/features/shipments/stages";
import { cn } from "@/lib/utils";

import type { WarehousePackage } from "../types";
import { formatDateTime, formatRelative, formatShortDate, pluralise, relativeInline } from "./format";
import { ShipmentUpdateDialog, type ShipmentUpdateMode } from "./shipment-update-dialog";

/**
 * A shipped package's journey to the door (098), on its own page — what the
 * Accra side sees when they scan a label off an arriving carton. The next step
 * is the big button; delays sit beside it.
 */

const STEPS: ShipmentStageKey[] = ["departed", "arrived_country", "ghana_warehouse", "out_for_delivery", "delivered"];

export function PackageJourneyPanel({
  pkg,
  settings,
}: {
  pkg: WarehousePackage;
  settings: Record<ShipmentStageKey, StageSetting>;
}) {
  const [mode, setMode] = useState<ShipmentUpdateMode | null>(null);
  const stage = pkg.stage ?? "departed";
  const allPickup = pkg.recipients.length > 0 && pkg.recipients.every((r) => r.kind === "pickup");
  const next = nextMovableStage(stage, allPickup);
  const orders = pkg.lines.filter((l) => l.item).length;
  const steps = STEPS.map((key) =>
    key === "out_for_delivery" && (stage === "ready_for_pickup" || (allPickup && stage !== "out_for_delivery"))
      ? ("ready_for_pickup" as const)
      : key,
  );

  return (
    <section className="tm-up flex flex-col gap-4 rounded-[22px] border border-tm-border bg-card p-5 [animation-duration:0.5s] [animation-delay:.04s]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold tracking-[0.16em] text-tm-coral-strong uppercase">Journey to the door</span>
          <h2 className="font-display text-[20px] leading-tight font-bold text-tm-ink">{settings[stage].title}</h2>
          <p className="text-[12.5px] font-medium text-tm-text-3">
            {pkg.stage_at ? `${formatRelative(pkg.stage_at)} · ${formatDateTime(pkg.stage_at)}` : null}
            {pkg.stage_by_name ? ` · ${pkg.stage_by_name}` : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pkg.notice ? (
            <AdminButton variant="quiet" onClick={() => setMode("clear")}>
              Clear delay
            </AdminButton>
          ) : null}
          {stage !== "delivered" ? (
            <AdminButton variant="secondary" onClick={() => setMode("delay")}>
              <ClockAlertIcon className="size-4" aria-hidden />
              Delay
            </AdminButton>
          ) : null}
          {next ? (
            <AdminButton variant="primary" onClick={() => setMode("move")}>
              {settings[next].title}
              <ArrowRightIcon className="size-4" aria-hidden />
            </AdminButton>
          ) : null}
        </div>
      </header>

      {pkg.notice ? (
        <div className="flex gap-2.5 rounded-[14px] bg-tm-amber-bg px-3.5 py-3 text-[13px] font-medium text-[#6B4708]">
          <ClockAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold break-words">{pkg.notice.message}</p>
            <p className="mt-0.5 text-[12px]">
              Shown to customers · posted {relativeInline(pkg.notice.at)}
              {pkg.notice.expected_on ? ` · new estimate ${formatShortDate(`${pkg.notice.expected_on}T12:00:00Z`)}` : ""}
            </p>
          </div>
        </div>
      ) : null}

      <ol className="grid grid-cols-5 gap-1">
        {steps.map((key) => {
          const done = STAGE_RANK[key] < STAGE_RANK[stage] || (key === stage && stage === "delivered");
          const current = key === stage && stage !== "delivered";
          return (
            <li key={key} className="flex flex-col gap-1.5">
              <span
                className={cn(
                  "h-1.5 rounded-full",
                  done ? "bg-tm-green" : current ? (pkg.notice ? "bg-tm-amber" : "bg-tm-coral") : "bg-tm-hairline",
                )}
              />
              <span className={cn("flex items-center gap-1 text-[11.5px] leading-tight font-semibold", done || current ? "text-tm-ink" : "text-tm-text-3")}>
                {done ? <CheckIcon className="size-3 shrink-0 text-tm-green" aria-hidden /> : null}
                {settings[key].title}
              </span>
            </li>
          );
        })}
      </ol>

      <ShipmentUpdateDialog
        open={mode !== null}
        onOpenChange={(open) => !open && setMode(null)}
        mode={mode ?? "move"}
        settings={settings}
        suggestedStage={next as MovableStage | null}
        targets={{
          package_ids: [pkg.id],
          order_ids: [],
          summary: `${pkg.reference} · ${pluralise(orders, "order")} · ${pluralise(pkg.recipients.length, "customer")}`,
        }}
      />
    </section>
  );
}
