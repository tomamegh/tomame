"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";

/**
 * Fix 13: notifications that sat pending for over a day get a recorded
 * decision instead of staying pending for ever. Nothing is sent now either way.
 */
export function SettlePendingPanel({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (count === 0) return null;

  const settle = async (disposition: "shown_in_bell" | "cancelled") => {
    const what = disposition === "shown_in_bell" ? "close them as shown in the bell" : "cancel them as never sent";
    if (!window.confirm(`Settle the notifications pending for over a day: ${what}? Nothing will be sent.`)) return;
    setBusy(disposition);
    try {
      const res = await apiFetch<{ data: { settled: number } }>("/api/admin/notifications/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disposition }),
      });
      toast.success({ title: `${res.data.settled} notifications settled`, description: "The decision is in the audit log." });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Couldn't settle them", description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-tm-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">
        <span className="font-semibold text-tm-ink">{count} pending for over a day.</span> They will not be sent late. Record what happened
        to them:
      </p>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button size="sm" variant="outline" className="rounded-full" disabled={busy !== null} onClick={() => settle("shown_in_bell")}>
          {busy === "shown_in_bell" ? "Settling…" : "Shown in the bell"}
        </Button>
        <Button size="sm" variant="outline" className="rounded-full" disabled={busy !== null} onClick={() => settle("cancelled")}>
          {busy === "cancelled" ? "Settling…" : "Cancel, never sent"}
        </Button>
      </div>
    </div>
  );
}
