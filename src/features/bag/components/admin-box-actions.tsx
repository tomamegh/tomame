"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";

/** Close one open box by hand (111). Its departure and contents stay as they are. */
export function CloseBoxButton({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const close = async () => {
    if (!window.confirm(`Close ${code}? Nothing more can be packed into it.`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/boxes/${id}/close`, { method: "POST" });
      toast.success({ title: `${code} closed` });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Couldn't close the box", description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="outline" className="h-7 rounded-full px-3 text-[12px]" onClick={close} disabled={busy} aria-busy={busy}>
      {busy ? "Closing…" : "Close box"}
    </Button>
  );
}

/** Run the schedule job now: departures ahead, boxes closed at cutoff, plans moved, empties archived. */
export function RunScheduleButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ data: Record<string, number> }>("/api/admin/boxes/schedule", { method: "POST" });
      const s = res.data;
      toast.success({
        title: "Schedule run",
        description: `${s.closed_cutoff ?? 0} closed at cutoff · ${s.closed_capacity ?? 0} full · ${s.rolled_forward ?? 0} moved to the next flight · ${s.archived ?? 0} empty archived`,
      });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Couldn't run the schedule", description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="outline" className="rounded-full" onClick={run} disabled={busy} aria-busy={busy}>
      {busy ? "Running…" : "Close, move and clean up now"}
    </Button>
  );
}
