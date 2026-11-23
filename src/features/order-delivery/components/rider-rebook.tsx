"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck } from "@phosphor-icons/react/ssr";

import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";

import type { RebookView } from "../services/rider-rebook.service";

const PILL =
  "inline-flex h-10 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] leading-none font-semibold text-tm-ink hover:bg-tm-paper disabled:opacity-60";

/** "Missed the rider? Rebook" (126): the next windows, one tap, no support chat. */
export function RiderRebook({ orderId, view }: { orderId: string; view: RebookView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const rebook = async (start: string, label: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/orders/${orderId}/rebook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start }),
      });
      toast.success({ title: "Delivery rebooked", description: `We'll bring it ${label}. You get the rider's details when it goes out.` });
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error({ title: "Couldn't rebook", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  if (view.options.length === 0 && !view.rebooked) return null;

  return (
    <div className="flex flex-col gap-2.5 border-t border-tm-hairline pt-3.5" data-testid="rider-rebook">
      {view.rebooked && (
        <p className="flex items-start gap-2 text-[13px] leading-[1.5] font-medium text-tm-ink">
          <CalendarCheck weight="duotone" className="mt-0.5 size-4 shrink-0 text-tm-coral" aria-hidden />
          <span>
            Rebooked for <span className="font-semibold">{view.rebooked.label}</span>. We send the rider&apos;s details when it goes out.
          </span>
        </p>
      )}
      {!open ? (
        view.options.length > 0 && (
          <button type="button" className={`${PILL} self-start`} onClick={() => setOpen(true)}>
            {view.rebooked ? "Pick another time" : "Missed the rider? Rebook"}
          </button>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] leading-[1.45] text-tm-text-2">When should we bring it?</p>
          <div className="flex flex-wrap gap-2">
            {view.options.map((o) => (
              <button key={o.start} type="button" disabled={busy} className={PILL} onClick={() => rebook(o.start, o.label)}>
                {o.label}
              </button>
            ))}
          </div>
          <button type="button" disabled={busy} className={`${PILL} self-start`} onClick={() => setOpen(false)}>
            Keep it
          </button>
        </div>
      )}
    </div>
  );
}
