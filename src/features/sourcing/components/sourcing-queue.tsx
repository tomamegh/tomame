"use client";

import { useCallback, useMemo, useState } from "react";
import { CheckIcon, ExternalLinkIcon, Loader2Icon, XIcon } from "lucide-react";

import { AdminBadge, AdminCard, AdminEmpty } from "@/components/layout/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { PriceWatchRow, SourcingStatus } from "@/db/queries/price-watches";
import { hostOf } from "@/features/bag/components/format";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import type { OriginCountry } from "@/features/orders/types";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { useAnswerSourcing, useSourcingQueue } from "../hooks/useSourcingQueue";

/**
 * `/admin/sourcing-requests` — the items a machine could not price (065).
 *
 * WHAT A ROW IS. A customer pasted a link to a store we do not know, or to a
 * product the pricing engine has no rule for. Rather than showing them a live
 * "Add to bag" over a total nobody stood behind, the item went into their bag
 * flagged, and they were told a person would price it. Every row here is that
 * promise, which is why the list is OLDEST FIRST and why the customer cannot
 * check out until it is answered.
 *
 * WHAT THE BUYER TYPES, AND WHAT THEY DO NOT. Two facts: what the item costs in
 * USD, and the country it ships from. There is no field for a cedi total, on
 * purpose — those two facts go into the same columns the quote screen's
 * gap-fillers use, and `calculator.ts` strikes the landed figure from them on
 * the next bag read. A hand-typed total would put a number on the customer's pay
 * button that no pricing engine ever checked.
 *
 * The customer's own guess, when they left one, is shown as a hint and nothing
 * more. It is stored in different columns for exactly that reason.
 */

const TABS: { key: SourcingStatus | "all"; label: string }[] = [
  { key: "requested", label: "Waiting" },
  { key: "available", label: "Priced" },
  { key: "unavailable", label: "Cannot get" },
  { key: "all", label: "All" },
];

const COUNTRIES: OriginCountry[] = ["USA", "UK", "CHINA"];

export function SourcingQueue() {
  const [tab, setTab] = useState<SourcingStatus | "all">("requested");
  const { data, isPending } = useSourcingQueue(tab);
  const answer = useAnswerSourcing();
  // WHICH row is being answered, not merely that one is: the mutation is shared
  // by the list, so keying off `isPending` would freeze every row at once.
  const [busyId, setBusyId] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);

  const onAnswer = useCallback(
    (
      row: PriceWatchRow,
      input:
        | { status: "available"; price_usd: number; origin_country: OriginCountry; note?: string }
        | { status: "unavailable"; note?: string },
    ) => {
      setBusyId(row.id);
      answer.mutate(
        // `from` is the status THIS buyer saw, so the server can refuse when
        // somebody else answered first rather than letting one overwrite the
        // other.
        { id: row.id, from: row.sourcing_status ?? "requested", ...input },
        {
          onSettled: () => setBusyId(null),
          onSuccess: () => {
            toast.success({
              title: input.status === "available" ? "Priced and sent" : "Marked as unavailable",
              description:
                input.status === "available"
                  ? "The customer can pay for it now."
                  : "The customer has been told we cannot get this one.",
            });
          },
          onError: (error) => {
            // A 409 means another buyer got there first. That is information,
            // not a fault, so it is said plainly — the same call the assisted
            // queue makes.
            if (error instanceof ApiFetchError && error.status === 409) {
              toast.info({
                title: "Someone else answered this one",
                description: "The queue has been refreshed.",
              });
              return;
            }
            toast.error({ title: "Could not save that", description: error.message });
          },
        },
      );
    },
    [answer],
  );

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Filter by status" className="flex flex-wrap items-center gap-1.5">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            aria-current={tab === entry.key ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12.5px] leading-none font-semibold transition-colors",
              tab === entry.key
                ? "border-tm-coral/40 bg-tm-tint text-tm-coral-strong"
                : "border-tm-border bg-card text-tm-text-2 hover:text-tm-ink",
            )}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {rows.length === 0 ? (
        <AdminEmpty
          title="Nothing waiting"
          body="When a customer asks us to source something the pricing engine could not handle, it lands here."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <SourcingRow
              key={row.id}
              row={row}
              now={now}
              busy={busyId === row.id}
              onAnswer={onAnswer}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SourcingRow({
  row,
  now,
  busy,
  onAnswer,
}: {
  row: PriceWatchRow;
  now: Date;
  busy: boolean;
  onAnswer: (
    row: PriceWatchRow,
    input:
      | { status: "available"; price_usd: number; origin_country: OriginCountry; note?: string }
      | { status: "unavailable"; note?: string },
  ) => void;
}) {
  // Pre-filled with whatever the customer guessed, because a buyer confirming a
  // number is faster than a buyer typing one — and they must still confirm it,
  // which is why it lands in a field rather than being taken as read.
  const [price, setPrice] = useState(
    row.sourced_price_usd != null
      ? String(row.sourced_price_usd)
      : row.customer_price_hint_usd != null
        ? String(row.customer_price_hint_usd)
        : "",
  );
  const [country, setCountry] = useState<OriginCountry | "">(
    row.sourced_origin_country ?? row.customer_origin_hint ?? "",
  );
  const [note, setNote] = useState(row.sourced_note ?? "");

  const priceUsd = Number.parseFloat(price);
  const canPrice = Number.isFinite(priceUsd) && priceUsd > 0 && country !== "";
  const open = row.sourcing_status === "requested";

  return (
    <li>
      <AdminCard>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="truncate text-sm font-semibold">
                {row.product_name ?? hostOf(row.product_url)}
              </p>
              <a
                href={row.product_url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-xs font-medium text-tm-coral hover:underline"
              >
                {hostOf(row.product_url)}
                <ExternalLinkIcon className="size-3" aria-hidden />
              </a>
            </div>
            <div className="flex items-center gap-2">
              <AdminBadge tone={open ? "amber" : row.sourcing_status === "available" ? "green" : "muted"}>
                {open ? "Waiting" : row.sourcing_status === "available" ? "Priced" : "Cannot get"}
              </AdminBadge>
              <span className="text-xs font-medium text-tm-text-3">{waitedFor(row.created_at, now)}</span>
            </div>
          </div>

          {/*
            The customer's own guess. Labelled as a guess, and never used as the
            price: it lives in `customer_price_hint_usd`, not `sourced_price_usd`.
          */}
          {(row.customer_price_hint_usd != null || row.customer_origin_hint) && (
            <p className="text-xs font-medium text-tm-text-2">
              Customer reckons{" "}
              {row.customer_price_hint_usd != null && (
                <span className="font-semibold text-tm-ink">${row.customer_price_hint_usd}</span>
              )}
              {row.customer_price_hint_usd != null && row.customer_origin_hint && ", "}
              {row.customer_origin_hint && (
                <span className="font-semibold text-tm-ink">ships from {row.customer_origin_hint}</span>
              )}
              . Confirm it before you send it back.
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-[130px_150px_1fr]">
            <label className="flex flex-col gap-1 text-xs font-medium text-tm-text-2">
              Price (USD)
              <Input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="49.99"
                disabled={busy}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-tm-text-2">
              Ships from
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value as OriginCountry | "")}
                disabled={busy}
                className="h-9 rounded-md border border-tm-border bg-card px-2 text-sm"
              >
                <option value="">Choose…</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-tm-text-2">
              Note to the customer
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="In stock, ships from New Jersey."
                disabled={busy}
              />
            </label>
          </div>

          <p className="text-[11px] leading-[1.45] font-medium text-tm-text-3">
            Enter what the ITEM costs, not what the customer pays. Freight, our
            fee, tax and the cedi rate are worked out from this.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!canPrice || busy}
              onClick={() =>
                onAnswer(row, {
                  status: "available",
                  price_usd: priceUsd,
                  origin_country: country as OriginCountry,
                  ...(note.trim() && { note: note.trim() }),
                })
              }
            >
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
              ) : (
                <CheckIcon className="size-4" aria-hidden />
              )}
              We can get this
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                onAnswer(row, { status: "unavailable", ...(note.trim() && { note: note.trim() }) })
              }
            >
              <XIcon className="size-4" aria-hidden />
              We cannot
            </Button>
          </div>
        </div>
      </AdminCard>
    </li>
  );
}

/** How long this customer has been waiting. The first thing a row should say. */
function waitedFor(createdAt: string, now: Date): string {
  const ms = now.getTime() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m waiting`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h waiting`;
  return `${Math.floor(hours / 24)}d waiting`;
}
