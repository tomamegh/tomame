"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";

import type { NotificationKind } from "../notification-kind";

async function review(body: { ids?: string[]; kind?: NotificationKind }): Promise<number> {
  const res = await apiFetch<{ data: { reviewed: number } }>("/api/admin/notifications/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.data.reviewed;
}

/**
 * Fix 8: failed and pending sends an admin has looked at stop counting as
 * "needing attention". Nothing is sent or cancelled; the decision is audited.
 */
export function ReviewAllPanel({ count, kind, kindLabel }: { count: number; kind?: NotificationKind; kindLabel?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (count === 0) return null;
  const onClick = async () => {
    setBusy(true);
    try {
      const n = await review(kind ? { kind } : {});
      toast.success({ title: `${n} marked reviewed`, description: "They no longer count as needing attention." });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Couldn't mark them reviewed", description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-tm-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">
        <span className="font-semibold text-tm-ink">{count} need attention</span> (failed or pending, not yet reviewed). Mark them reviewed once
        you have looked; nothing is sent or cancelled.
      </p>
      <Button size="sm" variant="outline" className="shrink-0 rounded-full" disabled={busy} onClick={onClick}>
        {busy ? "Marking…" : kindLabel ? `Mark all ${kindLabel.toLowerCase()} reviewed` : "Mark all reviewed"}
      </Button>
    </div>
  );
}

export function ReviewRowButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await review({ ids: [id] });
          router.refresh();
        } catch (error) {
          toast.error({ title: "Couldn't mark it reviewed", description: error instanceof Error ? error.message : undefined });
          setBusy(false);
        }
      }}
      className="text-[11.5px] leading-none font-semibold text-tm-coral-strong underline-offset-2 hover:underline disabled:opacity-50"
    >
      {busy ? "Marking…" : "Mark reviewed"}
    </button>
  );
}
