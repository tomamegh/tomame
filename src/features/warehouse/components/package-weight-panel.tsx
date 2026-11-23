"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LockIcon, ScaleIcon, TriangleAlertIcon } from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import type { WarehouseItem, WarehousePackage } from "../types";
import { capacityLine, lbs, packageLoad, sealWeightProblem, weightNote, type PackageLoad, type WeightTone } from "../weights";
import { errorText, warehouseRequest } from "./warehouse-actions";

/**
 * Weight and capacity on the package bench (114, site brief Fix 11): the
 * package's weight marked weighed or estimated, the true fill against the box
 * capacity, the items with no weight, and the reasons it was sealed with.
 */

const TONE_CLASS: Record<WeightTone, string> = {
  confirmed: "text-tm-green",
  estimate: "text-tm-text-3",
  over: "text-tm-coral-strong",
  missing: "text-tm-amber",
};

export function loadOf(pkg: WarehousePackage): PackageLoad {
  return packageLoad(pkg, pkg.capacity_lbs);
}

/** A problem no reason can clear (an item with no weight), for the seal button's blocker line. */
export function hardWeightBlocker(pkg: WarehousePackage): string | null {
  if (pkg.status !== "packing") return null;
  return sealWeightProblem(loadOf(pkg), { estimateReason: "-", capacityReason: "-" });
}

/** "2.4 lb weighed", "~3 lb estimated, not weighed". */
export function packageWeightText(load: PackageLoad): string {
  if (load.confirmedBy === "package") return `${lbs(load.lbs)} weighed`;
  if (load.confirmedBy === "items") return `${lbs(load.lbs)}, every item weighed`;
  if (load.lbs > 0) return `~${lbs(load.lbs)} estimated, not weighed`;
  return "not weighed";
}

export function LineWeightNote({ item, capacityLbs }: { item: WarehouseItem; capacityLbs: number | null }) {
  const note = weightNote(item, capacityLbs);
  return <p className={cn("mt-1 pl-[64px] text-[12px] leading-[1.4] font-semibold", TONE_CLASS[note.tone])}>{note.text}</p>;
}

export function PackageWeightPanel({ pkg }: { pkg: WarehousePackage }) {
  const load = loadOf(pkg);
  const line = capacityLine(load.lbs, load.capacityLbs);
  const pct = load.fill.pct;
  if (pkg.line_count === 0 && !line) return null;

  return (
    <div className="flex flex-col gap-2 rounded-[16px] bg-tm-paper/70 px-3.5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-tm-ink">
          <ScaleIcon className="size-3.5 text-tm-text-3" aria-hidden />
          {packageWeightText(load)}
        </span>
        {line ? (
          <span className={cn("tm-nums text-[12.5px] font-semibold", load.fill.over && !load.oversize ? "text-tm-coral-strong" : "text-tm-text-2")}>
            {line}
          </span>
        ) : null}
      </div>
      {pct != null ? (
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-card"
          role="meter"
          aria-label={`${pkg.reference} fill`}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={Math.max(100, pct)}
          aria-valuetext={line ?? undefined}
        >
          <div
            className={cn("h-full rounded-full", load.fill.over ? "bg-tm-coral-strong" : pct >= 90 ? "bg-tm-amber" : "bg-tm-green")}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      ) : null}
      {load.oversize ? (
        <p className="text-[12px] font-semibold text-tm-coral-strong">
          Oversize freight: one item heavier than a {lbs(load.capacityLbs!)} box, shipping on its own.
        </p>
      ) : load.fill.over && pct != null ? (
        <p className="text-[12px] font-semibold text-tm-coral-strong">{pct}% of the box. Split it, or seal with a reason.</p>
      ) : null}
      {/* While packing, the seal button's blocker line already says this. */}
      {load.missing.length > 0 && pkg.status !== "packing" ? (
        <p className="flex items-start gap-1.5 text-[12px] font-semibold text-tm-amber">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          {load.missing.join(", ")} {load.missing.length === 1 ? "has" : "have"} no weight. Weigh {load.missing.length === 1 ? "it" : "them"} before sealing.
        </p>
      ) : null}
      {!load.confirmed && load.estimateCount > 0 && pkg.status === "packing" ? (
        <p className="text-[12px] font-medium text-tm-text-3">
          {load.estimateCount === 1 ? "1 item is" : `${load.estimateCount} items are`} on the listed weight. Put the package on the scale and enter it under
          Details.
        </p>
      ) : null}
      {pkg.weight_estimate_reason ? (
        <p className="text-[12px] font-medium text-tm-text-2">Sealed on the estimate: {pkg.weight_estimate_reason}</p>
      ) : null}
      {pkg.capacity_override_reason ? (
        <p className="text-[12px] font-medium text-tm-text-2">Over the box, approved: {pkg.capacity_override_reason}</p>
      ) : null}
    </div>
  );
}

/** What sealing still needs a reason for: the estimate, the capacity, or nothing. */
export function sealNeeds(pkg: WarehousePackage): { estimate: boolean; capacity: boolean } {
  const load = loadOf(pkg);
  return {
    estimate: !load.confirmed,
    capacity: (load.oversizeMixed.length > 0 || (load.fill.over && !load.oversize)) && !pkg.capacity_override_reason,
  };
}

export function SealWeightDialog({
  pkg,
  open,
  onOpenChange,
}: {
  pkg: WarehousePackage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const load = loadOf(pkg);
  const needs = sealNeeds(pkg);
  const [estimateReason, setEstimateReason] = useState("");
  const [capacityReason, setCapacityReason] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = (!needs.estimate || estimateReason.trim().length > 2) && (!needs.capacity || capacityReason.trim().length > 2);

  const seal = async () => {
    setBusy(true);
    try {
      await warehouseRequest(`/api/warehouse/packages/${pkg.id}/actions`, "POST", {
        action: "seal",
        ...(needs.estimate ? { weight_estimate_reason: estimateReason.trim() } : {}),
        ...(needs.capacity ? { capacity_override_reason: capacityReason.trim() } : {}),
      });
      toast.success({ title: `${pkg.reference} sealed`, description: "Print the label and stick it on the top." });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not seal it", description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, hint: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-tm-ink">{label}</span>
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        maxLength={500}
        placeholder={placeholder}
        className="h-10 rounded-[12px] border border-tm-border bg-card px-3 text-[13.5px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60"
      />
      <span className="text-[12px] font-medium text-tm-text-3">{hint}</span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[20px] font-bold text-tm-ink">Seal {pkg.reference}?</DialogTitle>
          <DialogDescription className="text-[13px] font-medium text-tm-text-2">
            The package is charged on its weight. Weigh it and enter the reading under Details, or seal it with a reason. The reason is
            recorded on the package.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
          {needs.estimate
            ? field(
                `Seal on the estimate (${load.lbs > 0 ? `~${lbs(load.lbs)}` : "no weight"}): why not weighed?`,
                estimateReason,
                setEstimateReason,
                "e.g. Scale out of order today",
                "It stays marked as an estimate in the warehouse and admin.",
              )
            : null}
          {needs.capacity
            ? field(
                `Over the ${lbs(load.capacityLbs ?? 0)} box (${capacityLine(load.lbs, load.capacityLbs) ?? ""}): why not split?`,
                capacityReason,
                setCapacityReason,
                "e.g. One customer, approved by the manager",
                "Over-capacity packages show in admin with this reason.",
              )
            : null}
        </div>
        <DialogFooter>
          <AdminButton variant="quiet" onClick={() => onOpenChange(false)}>
            Weigh it first
          </AdminButton>
          <AdminButton variant="primary" busy={busy} disabled={!ready} onClick={seal}>
            <LockIcon className="size-4" aria-hidden />
            Seal with reason
          </AdminButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
