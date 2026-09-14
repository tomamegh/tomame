"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MagnifyingGlass, Path, X } from "@phosphor-icons/react/ssr";

import { toast } from "@/lib/sonner";
import { buyAgainHref, useJourneyPayment } from "../hooks/useJourneyPayment";
import type { JourneyFilterKey, JourneysViewModel } from "../types";
import { JourneyCard } from "./journey-card";
import { JourneyStopRail } from "./journey-stop-rail";

export interface JourneysViewProps {
  data: JourneysViewModel;
  /** `?payment=success|failed|error` from a Paystack return, read on the server. */
  paymentOutcome: string | null;
}

/**
 * `v2-journeys` — "a map, not a table" (design line 277).
 *
 * Server-rendered data, client-owned interaction: the filter is local state (no
 * round trip to re-bucket rows the browser already has), and paying is the only
 * thing that talks to the server.
 *
 * Layout is the artboard's: header and pills on one line, the stop rail, then a
 * two-column grid of cards that collapses to one below `lg`. The 390px view
 * (artboard 3 of `v2-mobile`) is the same screen at one column — it keeps the
 * bottom TAB bar, so `/app/orders` deliberately stays out of
 * `MOBILE_ACTION_BAR_ROUTES`: nothing on this screen is a single primary action.
 *
 * Delays are the mock's literals: header `tmUp .5s`, rail `.08s`, cards from
 * `.12s` stepping `.06s`.
 */
export function JourneysView({ data, paymentOutcome }: JourneysViewProps) {
  const router = useRouter();
  const payment = useJourneyPayment();

  // The default pill is the first one that actually has rows behind it, so a
  // customer whose orders have all been delivered does not land on an empty
  // "Moving" tab and conclude the screen is broken.
  const [filter, setFilter] = useState<JourneyFilterKey | null>(
    () => data.filters.find((entry) => entry.count > 0)?.key ?? null,
  );

  // The magnifier in artboard 3 of `v2-mobile`. It filters the rows the browser
  // already has — by product name and by order number, because "TM-00042" is
  // what a customer reads off a WhatsApp message. No round trip, and no
  // server-side search endpoint invented for it.
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const visible = useMemo(() => {
    const byFilter = filter ? data.rows.filter((row) => row.filter === filter) : data.rows;
    const needle = query.trim().toLowerCase();
    if (!needle) return byFilter;
    return byFilter.filter(
      (row) =>
        row.productName.toLowerCase().includes(needle) ||
        row.orderNo.toLowerCase().includes(needle) ||
        (row.store?.toLowerCase().includes(needle) ?? false),
    );
  }, [data.rows, filter, query]);

  // A Paystack success lands here. Say so once per mount — a re-render must not
  // re-toast. Deferred a tick because the Toaster lives in the root layout and
  // subscribes in its own effect, which runs after this child's on a fresh load,
  // so a synchronous toast is emitted to nobody. (The same shape as the bag's.)
  const announced = useRef(false);
  useEffect(() => {
    if (!paymentOutcome) return;
    const timer = setTimeout(() => {
      if (announced.current) return;
      announced.current = true;
      if (paymentOutcome === "success") {
        toast.success({ title: "Payment received. We are on it." });
      } else if (paymentOutcome === "failed") {
        toast.error({ title: "Payment did not go through. Nothing was charged." });
      } else if (paymentOutcome === "error") {
        toast.error({
          title: "We could not confirm your payment",
          description: "If you were charged it will show here shortly.",
        });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [paymentOutcome]);

  return (
    <div className="flex flex-col gap-6">
      <header className="tm-up flex flex-wrap items-end justify-between gap-4 [animation-duration:0.5s]">
        <div className="flex w-full items-center justify-between gap-3 lg:w-auto">
          <div>
            <h1 className="font-display text-[30px] leading-none font-bold lg:text-[34px]">
              Journeys
            </h1>
            <p className="mt-2 text-sm leading-none font-normal text-tm-text-2">
              Every item, from the store to your door.
            </p>
          </div>

          <button
            type="button"
            aria-label={searching ? "Close search" : "Search journeys"}
            aria-expanded={searching}
            onClick={() => {
              setSearching((open) => !open);
              if (searching) setQuery("");
            }}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-tm-border bg-card text-tm-ink"
          >
            {searching ? (
              <X className="size-[18px]" aria-hidden />
            ) : (
              <MagnifyingGlass className="size-[18px]" aria-hidden />
            )}
          </button>
        </div>

        {/*
          Real grouped counts over `orders.status`, not the mock's samples. A
          pill with nothing behind it stays visible and simply reads "· 0": a
          disappearing filter is harder to reason about than an empty one.
        */}
        <div
          role="group"
          aria-label="Filter journeys"
          className="flex gap-1.5 rounded-full border border-tm-border bg-card p-1"
        >
          {data.filters.map((entry) => {
            const active = filter === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(active ? null : entry.key)}
                className={`rounded-full px-3.5 py-2.5 text-[13px] leading-none font-semibold transition-colors ${
                  active ? "bg-tm-ink text-white" : "text-tm-text-2 hover:text-tm-ink"
                }`}
              >
                {entry.label} · {entry.count}
              </button>
            );
          })}
        </div>
      </header>

      {searching && (
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, store or TM number"
          aria-label="Search journeys"
          className="h-12 rounded-[14px] border border-tm-border bg-card px-4 text-sm leading-none font-medium outline-none placeholder:text-tm-text-3 focus:border-tm-coral"
        />
      )}

      <JourneyStopRail stops={data.stops} />

      {visible.length === 0 ? (
        <JourneysEmpty
          hasAnyOrders={data.count > 0}
          isNarrowed={!!filter || query.trim().length > 0}
          onClear={() => {
            setFilter(null);
            setQuery("");
          }}
        />
      ) : (
        /*
          `minmax(0,1fr)` below `lg`: an implicit `1fr` column's floor is the
          widest card's min-content, and a card's `truncate`d product title on
          one line is wider than a phone — so the column grew to ~620px and the
          cards ran off the right edge. A zero floor keeps the track at the
          container's width and lets `truncate` truncate.
        */
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
          {visible.map((row, index) => (
            <JourneyCard
              key={row.id}
              row={row}
              index={index}
              busy={payment.busyId === row.id}
              onPay={(target) =>
                payment.pay({ id: target.id, orderGroupId: target.orderGroupId })
              }
              onBuyAgain={(target) => router.push(buyAgainHref(target.productUrl))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Two different nothings. "You have no journeys" wants the paste bar; "nothing
 * matches" wants the filter and the search cleared — telling a customer with
 * four delivered parcels to go shopping would be wrong.
 */
function JourneysEmpty({
  hasAnyOrders,
  isNarrowed,
  onClear,
}: {
  hasAnyOrders: boolean;
  /** A filter pill or a search term is hiding rows that do exist. */
  isNarrowed: boolean;
  onClear: () => void;
}) {
  const narrowed = hasAnyOrders && isNarrowed;
  return (
    <div className="tm-up flex flex-col items-center gap-3 rounded-[24px] border border-tm-border bg-card px-6 py-14 text-center [animation-delay:0.12s] [animation-duration:0.5s]">
      <Path weight="duotone" className="size-8 text-tm-coral" aria-hidden />
      <p className="font-display text-lg leading-tight font-bold">
        {narrowed ? "Nothing matches" : "No journeys yet"}
      </p>
      <p className="max-w-[38ch] text-[13px] leading-[1.5] font-normal text-tm-text-2">
        {narrowed
          ? "Your other journeys are behind another filter, or under a different name."
          : "Paste a link to anything in a US store and we will land it in Accra."}
      </p>
      {narrowed ? (
        <button
          type="button"
          onClick={onClear}
          className="text-[13px] leading-none font-semibold text-tm-coral"
        >
          Show everything
        </button>
      ) : (
        <Link
          href="/app/orders/new"
          className="mt-1 inline-flex h-11 items-center rounded-[14px] bg-[image:var(--tm-gradient-cta)] px-5 text-sm leading-none font-bold text-white"
        >
          Paste a link
        </Link>
      )}
    </div>
  );
}
