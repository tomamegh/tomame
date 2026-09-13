"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import type { DeliveryAddress } from "@/features/addresses/types";
import type { PaymentChannel } from "@/features/payments/types";
import { useCreateWatch } from "@/features/watches/hooks/useWatches";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { useBag, useRemoveBagLine, useUpdateBagLine } from "../hooks/useBag";
import type { BagLine, BagView as BagViewData, PendingGroupSummary } from "../types";
import { BagBoxCard } from "./bag-box-card";
import { BagDeliverToCard } from "./bag-deliver-to-card";
import { BagEmpty } from "./bag-empty";
import { BagPendingGroupCard } from "./bag-pending-group-card";
import { BagLineRow } from "./bag-line-row";
import { BagSummaryCard } from "./bag-summary-card";

export interface BagViewProps {
  initialBag: BagViewData;
  /** Every active delivery zone; the Deliver-to card splits door from pickup. */
  zones: DeliveryZoneRow[];
  /** The viewer's saved addresses — empty for a signed-out viewer. */
  addresses: DeliveryAddress[];
  /** `site_settings.payment_channels`, in the order the admin set. */
  paymentChannels: PaymentChannel[];
  /** `site_settings.payment_hold_note`; null hides the line under the pay button. */
  paymentHoldNote: string | null;
  isSignedIn: boolean;
  /** The viewer's newest unpaid order group, offered again when the bag is empty. */
  pendingGroup: PendingGroupSummary | null;
  /** Server render time, ISO — the countdown is struck from it on both sides so hydration agrees. */
  renderedAt: string;
}

/**
 * `v2-bag` — the bag, grouped by the box each line travels in.
 *
 * Layout per the artboard (line 214): `1fr 420px`, gap 28, the rail sticky at
 * 20px. Header `tmUp .5s`, first box card `.08s`, rail `.12s`. Lines and
 * summary rows carry no animation in this artboard.
 *
 * The server render seeds the bag; every mutation goes through the API and the
 * whole bag is refetched, because a quantity change moves the box fill, the
 * saving and the total together — nothing here does arithmetic.
 */
export function BagView({ initialBag, zones, addresses, paymentChannels, paymentHoldNote, isSignedIn, pendingGroup, renderedAt }: BagViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: bag } = useBag(initialBag);
  const updateLine = useUpdateBagLine();
  const removeLine = useRemoveBagLine();
  const createWatch = useCreateWatch();
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  // The server's clock, not the browser's: a `new Date()` on each side renders
  // two different countdowns and fails hydration. Fixed for the page's life.
  const now = useMemo(() => new Date(renderedAt), [renderedAt]);

  // Paystack sends a failed payment back to `/app/bag?payment=failed`. Say so
  // once per mount — a re-render must not re-toast. Deferred a tick: the
  // Toaster lives in the root layout and subscribes in its own effect, which
  // runs AFTER this child's on a fresh page load, so a synchronous toast here
  // is emitted to nobody and silently lost.
  const failureAnnounced = useRef(false);
  const paymentOutcome = searchParams.get("payment");
  useEffect(() => {
    if (paymentOutcome !== "failed") return;
    const timer = setTimeout(() => {
      if (failureAnnounced.current) return;
      failureAnnounced.current = true;
      toast.error({ title: "Payment did not go through — nothing was charged." });
    }, 0);
    return () => clearTimeout(timer);
  }, [paymentOutcome]);

  const linesById = useMemo(() => new Map(bag.lines.map((l) => [l.id, l])), [bag.lines]);
  const unboxed = bag.unboxed_line_ids.map((id) => linesById.get(id)).filter((l): l is BagLine => !!l);

  const refreshChrome = useCallback(() => router.refresh(), [router]);

  const onQuantity = useCallback(
    (line: BagLine, quantity: number) => {
      setBusyLineId(line.id);
      updateLine.mutate(
        { id: line.id, quantity },
        {
          onError: (error) => toast.error({ title: "Could not update the quantity", description: error.message }),
          onSettled: () => {
            setBusyLineId(null);
            refreshChrome();
          },
        },
      );
    },
    [refreshChrome, updateLine],
  );

  const onRemove = useCallback(
    (line: BagLine) => {
      setBusyLineId(line.id);
      removeLine.mutate(
        { id: line.id },
        {
          onSuccess: () => toast.success({ title: "Removed from your bag" }),
          onError: (error) => toast.error({ title: "Could not remove the line", description: error.message }),
          onSettled: () => {
            setBusyLineId(null);
            refreshChrome();
          },
        },
      );
    },
    [refreshChrome, removeLine],
  );

  const onWatchInstead = useCallback(
    (line: BagLine) => {
      if (!line.product.url) return;
      setBusyLineId(line.id);
      createWatch.mutate(
        { url: line.product.url },
        {
          onSuccess: () => {
            // Watching replaces buying: the line leaves the bag once the watch exists.
            removeLine.mutate(
              { id: line.id },
              {
                onSuccess: () => toast.success({ title: "Watching the price instead", description: "We'll tell you when it drops." }),
                onSettled: () => {
                  setBusyLineId(null);
                  refreshChrome();
                },
              },
            );
          },
          onError: (error) => {
            setBusyLineId(null);
            if (error instanceof ApiFetchError && error.status === 401) {
              router.push(`/auth/login?next=${encodeURIComponent("/app/bag")}`);
              return;
            }
            toast.error({ title: "Could not start watching", description: error.message });
          },
        },
      );
    },
    [createWatch, refreshChrome, removeLine, router],
  );

  if (bag.lines.length === 0) {
    return (
      <div className="flex flex-col gap-[18px]">
        <BagHeader />
        {pendingGroup ? <BagPendingGroupCard group={pendingGroup} paymentChannels={paymentChannels} /> : <BagEmpty />}
      </div>
    );
  }

  return (
    <div className="grid items-start gap-7 lg:grid-cols-[1fr_420px]">
      <div className="flex flex-col gap-[18px]">
        <BagHeader />

        {bag.boxes.map((box, i) => (
          <BagBoxCard
            key={box.id}
            box={box}
            index={i}
            lines={box.line_ids.map((id) => linesById.get(id)).filter((l): l is BagLine => !!l)}
            busyLineId={busyLineId}
            onQuantity={onQuantity}
            onWatchInstead={onWatchInstead}
            onRemove={onRemove}
          />
        ))}

        {unboxed.length > 0 && (
          <section
            aria-label="Not yet boxed"
            className="tm-up overflow-hidden rounded-[24px] border border-tm-border bg-card [animation-duration:0.5s]"
            style={{ animationDelay: `${(0.08 + bag.boxes.length * 0.06).toFixed(2)}s` }}
          >
            <header className="px-[22px] py-4 text-sm leading-none font-bold text-tm-text-2">Waiting on a price</header>
            <ul>
              {unboxed.map((line) => (
                <BagLineRow
                  key={line.id}
                  line={line}
                  busy={busyLineId === line.id}
                  onQuantity={(q) => onQuantity(line, q)}
                  onWatchInstead={() => onWatchInstead(line)}
                  onRemove={() => onRemove(line)}
                />
              ))}
            </ul>
          </section>
        )}

        <BagDeliverToCard delivery={bag.delivery} zones={zones} addresses={addresses} isSignedIn={isSignedIn} />
      </div>

      <BagSummaryCard
        view={bag}
        now={now}
        paymentChannels={paymentChannels}
        paymentHoldNote={paymentHoldNote}
        isSignedIn={isSignedIn}
      />
    </div>
  );
}

/** "Your bag" + the one-line promise — `v2-bag` line 216, `tmUp .5s both`. */
function BagHeader() {
  return (
    <header className="tm-up flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 [animation-duration:0.5s]">
      <h1 className="font-display text-[34px] leading-none font-bold whitespace-nowrap">Your bag</h1>
      <p className="text-[13px] leading-none font-medium text-tm-text-3">Items travel together in one box when bought the same week</p>
    </header>
  );
}
