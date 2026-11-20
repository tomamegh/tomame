"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, WarningCircle, WhatsappLogo } from "@phosphor-icons/react/ssr";

import { AdminBadge, AdminCard } from "@/components/layout/admin";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";

import type { ManualWhatsAppEntry } from "../manual-whatsapp";

export interface AdminWhatsAppPanelProps {
  orderId: string;
  entries: ManualWhatsAppEntry[];
  /** The checkout tick: true, false, or null for an order from before it existed. */
  optIn: boolean | null;
  failed: { at: string; reason: string | null } | null;
  index?: number;
}

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Accra",
});

/**
 * Phase 1 WhatsApp (decision 4): one row per stage the order has reached, with
 * "Send WhatsApp" (wa.me, the stage's template filled in) and a recorded
 * "WhatsApp sent" tick. The site is the one record; there is no spreadsheet.
 */
export function AdminWhatsAppPanel({ orderId, entries, optIn, failed, index = 0 }: AdminWhatsAppPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function markSent(stage: string) {
    setBusy(stage);
    try {
      await apiFetch(`/api/admin/orders/${orderId}/whatsapp-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not record it", description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminCard
      title="WhatsApp updates"
      blurb="Send each stage's message from here, then tick it. The text is the approved template, filled in."
      index={index}
      action={
        <AdminBadge tone={optIn === false ? "neutral" : optIn ? "green" : "amber"}>
          {optIn === false ? "Did not opt in" : optIn ? "Opted in at checkout" : "No checkout choice"}
        </AdminBadge>
      }
    >
      <div className="flex flex-col gap-3">
        {failed ? (
          <div role="alert" className="flex items-start gap-2.5 rounded-[14px] bg-tm-amber-bg px-4 py-3">
            <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-tm-amber" />
            <p className="text-[13px] leading-[1.5] font-medium text-[#7a4a06]">
              An automated WhatsApp failed {WHEN.format(new Date(failed.at))}
              {failed.reason ? ` (${failed.reason})` : ""}. Message the customer by hand today, then tick it below.
            </p>
          </div>
        ) : null}

        {entries.length === 0 ? (
          <p className="text-[13px] font-medium text-tm-text-3">Nothing to send until the order is paid.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-tm-hairline">
            {entries.map((entry) => (
              <li key={entry.stage} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13.5px] font-bold text-tm-ink">{entry.stageName}</span>
                  {entry.sent ? (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-tm-green">
                      <CheckCircle weight="fill" className="size-4" aria-hidden />
                      WhatsApp sent {WHEN.format(new Date(entry.sent.at))}
                      {entry.sent.by ? ` by ${entry.sent.by}` : ""}
                    </span>
                  ) : null}
                </div>
                <p className="text-[12.5px] leading-[1.5] text-tm-text-2">{entry.text}</p>
                <div className="flex flex-wrap gap-2">
                  {entry.href ? (
                    <a
                      href={entry.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-tm-border px-3.5 text-[12.5px] font-semibold text-tm-ink hover:border-tm-coral/30"
                    >
                      <WhatsappLogo weight="fill" className="size-4 text-tm-green" aria-hidden />
                      Send WhatsApp
                    </a>
                  ) : (
                    <span className="text-[12.5px] font-medium text-tm-text-3">No customer phone on file.</span>
                  )}
                  {!entry.sent ? (
                    <button
                      type="button"
                      onClick={() => void markSent(entry.stage)}
                      disabled={busy === entry.stage}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-tm-ink px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
                    >
                      <CheckCircle className="size-4" aria-hidden />
                      Mark WhatsApp sent
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminCard>
  );
}
