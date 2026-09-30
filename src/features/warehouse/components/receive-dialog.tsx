"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CameraIcon, ScaleIcon } from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/sonner";

import type { WarehouseItem } from "../types";
import { formatLbs, sanitiseDecimal } from "./format";
import { errorText, warehouseRequest } from "./warehouse-actions";
import { ItemThumb } from "./warehouse-ui";

/**
 * Log a parcel in (081). The weight field takes focus, because the operator's
 * other hand is on the scale; Enter submits. Re-opening it on a received item
 * records a re-weigh, which the customer's timeline shows as such.
 */
export function ReceiveDialog({
  item,
  open,
  onOpenChange,
}: {
  item: WarehouseItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [location, setLocation] = useState("US hub");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const reweigh = !!item.received;

  useEffect(() => {
    if (open) {
      setWeight(item.received?.weight_lbs ? String(item.received.weight_lbs) : "");
      setLocation(item.received?.location ?? "US hub");
      setNote("");
    }
  }, [open, item.received]);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const parsed = weight.trim() ? Number(weight) : null;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) {
      toast.error({ title: "Check the weight", description: "Enter the scale reading in pounds, e.g. 1.4" });
      return;
    }
    setBusy(true);
    try {
      await warehouseRequest(`/api/warehouse/items/${item.order_id}/receive`, "POST", {
        weight_lbs: parsed,
        location: location.trim() || null,
        note: note.trim() || null,
      });
      toast.success({
        title: reweigh ? `${item.order_no} re-weighed` : `${item.order_no} logged in`,
        description: parsed ? `${formatLbs(parsed)} recorded. The customer's tracking now shows it at the hub.` : "The customer's tracking now shows it at the hub.",
      });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not log it in", description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle className="font-display text-[20px] font-bold text-tm-ink">
              {reweigh ? "Re-weigh parcel" : "Log parcel in"}
            </DialogTitle>
            <DialogDescription className="text-[13px] font-medium text-tm-text-2">
              Check it matches, weigh it, then add photos so the customer can confirm it is theirs.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3 rounded-[16px] bg-tm-paper p-3">
            <ItemThumb item={item} size={56} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="line-clamp-2 text-[13.5px] font-semibold text-tm-ink">{item.title}</span>
              <span className="text-[12px] font-medium text-tm-text-3">
                <span className="font-mono text-tm-text-2">{item.order_no}</span> · Qty {item.quantity}
                {item.store ? ` · ${item.store}` : ""}
                {item.listed_weight_lbs ? ` · listed ${formatLbs(item.listed_weight_lbs)}` : ""}
              </span>
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-tm-ink">Weight on the scale</span>
            <span className="relative flex items-center">
              <ScaleIcon className="pointer-events-none absolute left-4 size-5 text-tm-text-3" aria-hidden />
              <input
                autoFocus
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(sanitiseDecimal(e.target.value))}
                placeholder="0.0"
                className="tm-nums h-14 w-full rounded-[16px] border border-tm-border bg-card pr-14 pl-12 font-display text-[26px] font-bold text-tm-ink outline-none placeholder:text-tm-text-3/50 focus:border-tm-coral/60 focus:ring-4 focus:ring-tm-coral/10"
                aria-describedby="weight-hint"
              />
              <span className="pointer-events-none absolute right-4 text-[15px] font-bold text-tm-text-3">lb</span>
            </span>
            <span id="weight-hint" className="text-[12px] font-medium text-tm-text-3">
              Optional, but it is what the box is charged on. Leave blank to weigh later.
            </span>
          </label>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-tm-ink">Where</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={80}
                className="h-10 rounded-[12px] border border-tm-border bg-card px-3 text-[13.5px] font-medium text-tm-ink outline-none focus:border-tm-coral/60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-tm-ink">Note for the customer</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                placeholder="e.g. Box slightly dented"
                className="h-10 rounded-[12px] border border-tm-border bg-card px-3 text-[13.5px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60"
              />
            </label>
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
            <Link
              href={`/warehouse/items/${item.order_id}#photos`}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-tm-text-2 hover:text-tm-ink"
            >
              <CameraIcon className="size-4" aria-hidden />
              Photos
            </Link>
            <AdminButton type="submit" variant="primary" busy={busy}>
              {reweigh ? "Save weight" : "Log it in"}
            </AdminButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
