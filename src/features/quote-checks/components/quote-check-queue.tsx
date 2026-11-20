"use client";

import { useState } from "react";
import { ExternalLinkIcon } from "lucide-react";

import { AdminBadge, AdminCard, AdminEmpty } from "@/components/layout/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { QuoteCheckRow } from "@/db/queries/quote-checks";
import type { QuoteCheckKind, QuoteCheckStatus } from "@/features/extraction/pay-gate";
import { ApiFetchError } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import type { QuoteCheckAction } from "../schema";
import { useDecideQuoteCheck, useQuoteChecks } from "../hooks/useQuoteChecks";

/**
 * `/admin/stock-checks` and `/admin/price-checks` (103): every row is a quote
 * a customer cannot pay for until someone checks the store. Plain on purpose;
 * the visual pass is separate.
 */

const TABS: { key: QuoteCheckStatus | "all"; label: string }[] = [
  { key: "pending", label: "Waiting" },
  { key: "confirmed", label: "Confirmed" },
  { key: "all", label: "All" },
];

const STATUS_LABEL: Record<QuoteCheckStatus, string> = {
  checking: "Re-reading",
  pending: "Waiting",
  confirmed: "Confirmed",
  corrected: "Corrected",
  unavailable: "Unavailable",
  dismissed: "Dismissed",
  lapsed: "Re-read failed",
};

export function QuoteCheckQueue({ kind }: { kind: QuoteCheckKind }) {
  const [tab, setTab] = useState<QuoteCheckStatus | "all">("pending");
  const { data, isPending } = useQuoteChecks(kind, tab);
  const rows = data ?? [];

  return (
    <AdminCard
      title={TABS.find((t) => t.key === tab)?.label ?? "Checks"}
      blurb={
        kind === "stock"
          ? "Renewed, used, low-stock and deal listings. Check the store, then confirm (good for 24 hours) or mark unavailable."
          : "Prices we could not confirm automatically, and prices customers reported. Check the store, then confirm or correct."
      }
      action={
        <div className="flex gap-1.5">
          {TABS.map((t) => (
            <Button key={t.key} size="sm" variant={t.key === tab ? "default" : "outline"} onClick={() => setTab(t.key)}>
              {t.label}
            </Button>
          ))}
        </div>
      }
    >
      {isPending ? (
        <Skeleton className="h-32 w-full rounded-[16px]" />
      ) : rows.length === 0 ? (
        <AdminEmpty title="Nothing here" body={tab === "pending" ? "No customer is waiting on a check." : "No checks in this view yet."} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <CheckRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </AdminCard>
  );
}

function CheckRow({ row }: { row: QuoteCheckRow }) {
  const decide = useDecideQuoteCheck();
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");
  const [substitute, setSubstitute] = useState("");
  const open = row.status === "pending";
  const isReport = row.origin === "customer";

  const act = (action: QuoteCheckAction) => {
    decide.mutate(
      {
        id: row.id,
        from: row.status,
        action,
        ...(note.trim() && { note: note.trim() }),
        ...(action === "correct" && { price: Number(price) }),
        ...(action === "unavailable" && substitute.trim() && { substitute_url: substitute.trim() }),
      },
      {
        onSuccess: () => toast.success({ title: "Saved", description: "The customer's quote updates on its next read." }),
        onError: (error) => {
          if (error instanceof ApiFetchError && error.status === 409) {
            toast.info({ title: "Already decided", description: error.message });
            return;
          }
          toast.error({ title: "Could not save that", description: error.message });
        },
      },
    );
  };

  return (
    <li className="flex flex-col gap-2.5 rounded-[16px] border border-tm-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-tm-text-3">
        <AdminBadge tone={open ? "amber" : row.status === "unavailable" ? "coral" : "neutral"}>{STATUS_LABEL[row.status]}</AdminBadge>
        {isReport ? <AdminBadge tone="coral">Customer report</AdminBadge> : null}
        <span>{new Date(row.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
        {row.platform ? <span>· {row.platform}</span> : null}
        {row.price_source ? <span>· read by {row.price_source}</span> : null}
      </div>

      <p className="text-[15px] leading-[1.4] font-semibold text-tm-ink">{row.product_title ?? "Untitled product"}</p>
      <a href={row.product_url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-[12px] text-tm-text-3 hover:text-tm-coral-strong">
        <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{row.product_url}</span>
      </a>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] text-tm-text-2">
        <dt className="font-semibold">Quoted</dt>
        <dd className="tm-nums">{row.quoted_price != null ? `${row.quoted_currency ?? ""} ${row.quoted_price}` : "—"}</dd>
        {row.reasons.length ? (
          <>
            <dt className="font-semibold">Why</dt>
            <dd>{row.reasons.join("; ")}</dd>
          </>
        ) : null}
        {row.reported_price != null ? (
          <>
            <dt className="font-semibold">Customer sees</dt>
            <dd className="tm-nums">{row.reported_price}</dd>
          </>
        ) : null}
        {row.customer_note ? (
          <>
            <dt className="font-semibold">Customer note</dt>
            <dd>{row.customer_note}</dd>
          </>
        ) : null}
        {row.reread_price != null ? (
          <>
            <dt className="font-semibold">Re-read</dt>
            <dd className="tm-nums">{`${row.reread_currency ?? ""} ${row.reread_price} via ${row.reread_source ?? "?"}`}</dd>
          </>
        ) : null}
        {row.confirmed_price != null ? (
          <>
            <dt className="font-semibold">Confirmed at</dt>
            <dd className="tm-nums">{row.confirmed_price}</dd>
          </>
        ) : null}
        {row.substitute_url ? (
          <>
            <dt className="font-semibold">Substitute</dt>
            <dd className="truncate">{row.substitute_url}</dd>
          </>
        ) : null}
        {row.valid_until ? (
          <>
            <dt className="font-semibold">Valid until</dt>
            <dd>{new Date(row.valid_until).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</dd>
          </>
        ) : null}
        {row.decision_note ? (
          <>
            <dt className="font-semibold">Note</dt>
            <dd>{row.decision_note}</dd>
          </>
        ) : null}
      </dl>

      {open ? (
        <div className="flex flex-col gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (optional): what you saw on the store" />
          {row.kind === "price" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={decide.isPending} onClick={() => act("confirm")}>
                Price is right
              </Button>
              <Input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder={`Store price${row.quoted_currency ? ` (${row.quoted_currency})` : ""}`}
                className="w-40"
              />
              <Button size="sm" variant="outline" disabled={decide.isPending || !(Number(price) > 0)} onClick={() => act("correct")}>
                Correct the price
              </Button>
              {isReport ? (
                <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => act("dismiss")}>
                  Dismiss
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={decide.isPending} onClick={() => act("confirm")}>
                Confirm stock and condition
              </Button>
              <Input value={substitute} onChange={(e) => setSubstitute(e.target.value)} placeholder="Substitute link (optional, https)" className="w-72" />
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => act("unavailable")}>
                Unavailable
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}
