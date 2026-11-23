"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatGhs } from "@/features/marketing/format";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import type { RequoteResult } from "../services/bag.service";

/**
 * Fix 14: one click re-quotes a bag at today's rate. The first click only
 * previews: every line's snapshot total, the new total and the difference.
 * Saving stores the new quotes, which returns an expired bag to Ready to pay.
 * Nothing is sent to the customer at any point.
 */
export function AdminBagRequote({ cartId, owner }: { cartId: string; owner: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<RequoteResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);

  const call = async (apply: boolean) => {
    setBusy(apply ? "apply" : "preview");
    try {
      const res = await apiFetch<{ data: RequoteResult }>(`/api/admin/bags/${cartId}/requote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply }),
      });
      if (apply) {
        toast.success({
          title: "Re-quoted at today's rate",
          description: res.data.unpriced_count > 0 ? `${res.data.unpriced_count} line still needs a price.` : "The bag is back to Ready to pay.",
        });
        setOpen(false);
        setPreview(null);
        router.refresh();
      } else {
        setPreview(res.data);
        setOpen(true);
      }
    } catch (error) {
      toast.error({ title: "Couldn't re-quote the bag", description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" className="rounded-full" disabled={busy !== null} onClick={() => call(false)}>
        {busy === "preview" ? "Re-quoting…" : "Re-quote"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="min-w-0 sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[20px] font-bold break-words text-tm-ink">Re-quote {owner}&apos;s bag</DialogTitle>
            <DialogDescription className="text-[13px] font-medium text-tm-text-2">
              Today&apos;s rate against the stored snapshot. Nothing is saved or sent to the customer until you save it.
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="flex min-w-0 flex-col gap-3">
              <ul className="flex flex-col gap-1.5">
                {preview.lines.map((line) => (
                  <li key={line.id} className="flex min-w-0 flex-col gap-0.5 rounded-[12px] bg-tm-paper px-3 py-2">
                    <span className="line-clamp-1 text-[12.5px] font-semibold break-all text-tm-ink">
                      {line.title ?? "Line"} {line.quantity > 1 ? `× ${line.quantity}` : ""}
                    </span>
                    {line.new_total_ghs != null ? (
                      <span className="tm-nums text-[12.5px] font-medium text-tm-text-2">
                        {line.snapshot_total_ghs != null ? formatGhs(line.snapshot_total_ghs) : "no snapshot"} → {formatGhs(line.new_total_ghs)}
                        {line.diff_ghs != null ? <Diff value={line.diff_ghs} className="ml-1.5" /> : null}
                      </span>
                    ) : (
                      <span className="text-[12px] font-semibold text-tm-amber">{line.reason ?? "Cannot be priced now"}</span>
                    )}
                  </li>
                ))}
              </ul>
              <dl className="grid grid-cols-3 gap-2 rounded-[14px] border border-tm-border px-3 py-2.5 [&_dd]:break-words">
                <Total label="Snapshot" value={formatGhs(preview.snapshot_total_ghs)} />
                <Total label="New total" value={formatGhs(preview.new_total_ghs)} />
                <div className="flex flex-col gap-0.5">
                  <dt className="text-[11.5px] font-semibold text-tm-text-3">Difference</dt>
                  <dd className="tm-nums text-[14px] font-bold">
                    <Diff value={preview.diff_ghs} />
                  </dd>
                </div>
              </dl>
              <p className="text-[12px] font-medium text-tm-text-3">
                Totals cover the lines that can be priced now, before the box saving and delivery. The customer&apos;s bag shows the same figures
                when they open it.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" className="rounded-full" onClick={() => setOpen(false)}>
              Not now
            </Button>
            <Button className="rounded-full" disabled={busy !== null || !preview || preview.lines.every((l) => l.new_total_ghs == null)} onClick={() => call(true)}>
              {busy === "apply" ? "Saving…" : "Save the new quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11.5px] font-semibold text-tm-text-3">{label}</dt>
      <dd className="tm-nums text-[14px] font-bold text-tm-ink">{value}</dd>
    </div>
  );
}

function Diff({ value, className }: { value: number; className?: string }) {
  if (Math.abs(value) < 0.01) return <span className={cn("text-tm-text-3", className)}>no change</span>;
  return (
    <span className={cn(value > 0 ? "text-tm-coral-strong" : "text-tm-green", className)}>
      {value > 0 ? "+" : "−"}
      {formatGhs(Math.abs(value))}
    </span>
  );
}
