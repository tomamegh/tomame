"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BoxIcon, CameraIcon, InboxIcon, PauseCircleIcon, PlayCircleIcon, ScaleIcon } from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import { ParcelHoldDialog } from "@/features/feedback/components/parcel-hold-dialog";
import { useHoldOrder, useReleaseOrderHold } from "@/features/feedback/hooks/useFeedbackQueue";
import { toast } from "@/lib/sonner";

import type { WarehouseItem } from "../types";
import { ReceiveDialog } from "./receive-dialog";
import { PackItemsButton, errorText } from "./warehouse-actions";

/** The verbs on one parcel (081): log in, weigh, photograph, pack, hold. */
export function ItemActions({ item }: { item: WarehouseItem }) {
  const router = useRouter();
  const [receiving, setReceiving] = useState(false);
  const [holdMode, setHoldMode] = useState<"hold" | "release" | null>(null);
  const hold = useHoldOrder();
  const release = useReleaseOrderHold();
  const onBench = item.stage === "awaiting" || item.stage === "received";

  const confirmHold = (text: string) => {
    const done = () => {
      setHoldMode(null);
      router.refresh();
    };
    const fail = (error: unknown) =>
      toast.error({ title: holdMode === "hold" ? "Could not hold it" : "Could not release it", description: errorText(error) });
    if (holdMode === "hold") {
      hold.mutate(
        { orderId: item.order_id, reason: text },
        { onSuccess: () => { toast.success({ title: `${item.order_no} is on hold`, description: "It cannot be sealed or shipped until released." }); done(); }, onError: fail },
      );
    } else {
      release.mutate(
        { orderId: item.order_id, note: text },
        { onSuccess: () => { toast.success({ title: `${item.order_no} released` }); done(); }, onError: fail },
      );
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {item.stage === "awaiting" ? (
        <AdminButton variant="primary" className="h-10 px-5" onClick={() => setReceiving(true)}>
          <InboxIcon className="size-4" aria-hidden />
          Log it in
        </AdminButton>
      ) : null}
      {item.stage === "received" && !item.package && !item.held ? (
        <PackItemsButton orderIds={[item.order_id]} label="Pack it" className="h-10 px-5" />
      ) : null}
      {item.stage === "received" ? (
        <AdminButton variant="secondary" className="h-10" onClick={() => setReceiving(true)}>
          <ScaleIcon className="size-4" aria-hidden />
          Re-weigh
        </AdminButton>
      ) : null}
      <Link
        href="#photos"
        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-ink transition-colors hover:bg-tm-paper"
      >
        <CameraIcon className="size-4" aria-hidden />
        Photos{item.photo_count ? ` (${item.photo_count})` : ""}
      </Link>
      {item.package ? (
        <Link
          href={`/warehouse/packages/${item.package.id}`}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-ink transition-colors hover:bg-tm-paper"
        >
          <BoxIcon className="size-4" aria-hidden />
          Open {item.package.reference}
        </Link>
      ) : null}
      {onBench || item.stage === "packed" ? (
        item.held ? (
          <AdminButton variant="secondary" className="h-10" onClick={() => setHoldMode("release")}>
            <PlayCircleIcon className="size-4" aria-hidden />
            Release hold
          </AdminButton>
        ) : (
          <AdminButton variant="danger" className="h-10" onClick={() => setHoldMode("hold")}>
            <PauseCircleIcon className="size-4" aria-hidden />
            Hold
          </AdminButton>
        )
      ) : null}

      <ReceiveDialog item={item} open={receiving} onOpenChange={setReceiving} />
      <ParcelHoldDialog
        open={holdMode !== null}
        onOpenChange={(o) => !o && setHoldMode(null)}
        mode={holdMode ?? "hold"}
        orderRef={item.order_no}
        standingReason={item.held?.reason ?? null}
        busy={hold.isPending || release.isPending}
        onConfirm={confirmHold}
      />
    </div>
  );
}
