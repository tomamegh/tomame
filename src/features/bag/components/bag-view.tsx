"use client";

import Link from "next/link";
import { Plus } from "@phosphor-icons/react/ssr";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import type { DeliveryAddress } from "@/features/addresses/types";
import type { PaymentChannel } from "@/features/payments/types";
import { useCreateWatch } from "@/features/watches/hooks/useWatches";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { useBag, useRemoveBagLine, useUpdateBagLine } from "../hooks/useBag";
import { useBagPayment } from "../hooks/useBagPayment";
import type { BagLine, BagView as BagViewData, PendingGroupSummary } from "../types";
import { BagBoxCard } from "./bag-box-card";
import { BagDeliverToCard } from "./bag-deliver-to-card";
import { BagEmpty } from "./bag-empty";
import { AssistedRequestDialog } from "@/features/assisted/components";
import { BagPasteLinkBar, BagPayBar } from "./bag-pay-bar";
import { BagPendingGroupCard } from "./bag-pending-group-card";
import { BagLineRow } from "./bag-line-row";
import { BagSummaryCard } from "./bag-summary-card";
import { formatLockCountdown } from "./format";

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
 * Below `lg` the grid collapses to one column, the rail stops being sticky and
 * flows under the boxes, and the pay button leaves it for `BagPayBar` at the
 * bottom edge — `/app/bag` is in `MOBILE_ACTION_BAR_ROUTES`, so the tab bar
 * stands down here and the bar is rendered in EVERY state, empty bag included.
 *
 * The server render seeds the bag; every mutation goes through the API and the
 * whole bag is refetched, because a quantity change moves the box fill, the
 * saving and the total together — nothing here does arithmetic.
 */
export function BagView({ initialBag, zones, addresses, paymentChannels, paymentHoldNote, isSignedIn, pendingGroup, renderedAt }: BagViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: bag } = useBag(initialBag);
  const payment = useBagPayment({ isSignedIn, channels: paymentChannels });
  const updateLine = useUpdateBagLine();
  const removeLine = useRemoveBagLine();
  const createWatch = useCreateWatch();
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  // The line whose "Describe it instead" was pressed; null closes the dialog.
  const [describing, setDescribing] = useState<BagLine | null>(null);
  // The server's clock, not the browser's: a `new Date()` on each side renders
  // two different countdowns and fails hydration. So the first paint is exactly
  // the server's instant, and only AFTER mount does it advance — by elapsed time
  // since mount rather than by reading the browser's clock, so a device whose
  // clock is minutes out still counts the wait correctly.
  const [now, setNow] = useState(() => new Date(renderedAt));
  const pendingLines = bag.has_pending_lines;
  useEffect(() => {
    // After mount the clock is the real one. It used to advance from
    // `renderedAt` plus time-since-mount, which gives NEGATIVE elapsed time for a
    // line added after the page was rendered — so its wait copy never moved off
    // "Reading this page…". See `paste-queue-view.tsx` for the same fix.
    setNow(new Date());
    // Nothing else is waiting on the clock: the rate-lock countdown is hours
    // long and does not need a ticking second hand.
    if (!pendingLines) return;
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, [pendingLines]);

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

  // A signed-out viewer keeps a live button: it sends them to sign in, where
  // they can then choose a delivery. Everything else is a genuine blocker.
  const blocked = bag.lines.length === 0 || bag.has_unpriced_lines || (isSignedIn && !bag.delivery);

  const linesById = useMemo(() => new Map(bag.lines.map((l) => [l.id, l])), [bag.lines]);
  const unboxed = bag.unboxed_line_ids.map((id) => linesById.get(id)).filter((l): l is BagLine => !!l);
  // Two different states share the "not in a box" bucket: a link still being
  // read, and one that was read but could not be priced. They get separate
  // headings because "Still reading" over "Price could not be read" is a
  // contradiction the customer has to resolve themselves.
  const stillReading = unboxed.filter((l) => l.pending != null);
  const unpriced = unboxed.filter((l) => l.pending == null);

  const refreshChrome = useCallback(() => router.refresh(), [router]);
  const onDescribeIt = useCallback((line: BagLine) => setDescribing(line), []);

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
      <div className="flex flex-col gap-[18px] pb-[95px] lg:pb-0">
        <BagHeader />
        {pendingGroup ? (
          <>
            <BagPendingGroupCard group={pendingGroup} paymentChannels={paymentChannels} payment={payment} />
            <BagPayBar
              totalGhs={pendingGroup.total_ghs}
              verb="finish"
              busy={payment.busy}
              disabled={false}
              onPay={() => payment.payGroup(pendingGroup.id)}
              countdown={null}
            />
          </>
        ) : (
          <>
            <BagEmpty />
            <BagPasteLinkBar />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="grid items-start gap-7 pb-[95px] lg:grid-cols-[1fr_420px] lg:pb-0">
      <div className="flex flex-col gap-[18px]">
        <BagHeader />

        {bag.boxes.map((box, i) => (
          <BagBoxCard
            key={box.id}
            box={box}
            index={i}
            lines={box.line_ids.map((id) => linesById.get(id)).filter((l): l is BagLine => !!l)}
            now={now}
            busyLineId={busyLineId}
            onQuantity={onQuantity}
            onWatchInstead={onWatchInstead}
            onRemove={onRemove}
            onDescribeIt={onDescribeIt}
            notifies={isSignedIn}
          />
        ))}

        {stillReading.length > 0 && (
          <UnboxedGroup
            label="Still reading"
            lines={stillReading}
            delay={0.08 + bag.boxes.length * 0.06}
            now={now}
            busyLineId={busyLineId}
            onQuantity={onQuantity}
            onWatchInstead={onWatchInstead}
            onRemove={onRemove}
            onDescribeIt={onDescribeIt}
            notifies={isSignedIn}
          />
        )}

        {unpriced.length > 0 && (
          <UnboxedGroup
            label="Waiting on a price"
            lines={unpriced}
            delay={0.08 + (bag.boxes.length + (stillReading.length ? 1 : 0)) * 0.06}
            now={now}
            busyLineId={busyLineId}
            onQuantity={onQuantity}
            onWatchInstead={onWatchInstead}
            onRemove={onRemove}
            onDescribeIt={onDescribeIt}
            notifies={isSignedIn}
          />
        )}

        {/*
          The way to a SECOND item. After adding something the customer was
          handed the bag and then had to find the Buy tab on their own — Kelvin:
          "explicit load more products after adding to cart will be great". A
          bag is meant to hold several things bought the same week, so the
          invitation to add the next one belongs right under the lines.
        */}
        <Link
          href="/app/orders/new"
          className="tm-up flex items-center justify-between gap-3 rounded-[24px] border border-dashed border-tm-border bg-card px-[18px] py-4 text-sm font-semibold text-tm-coral transition-colors hover:bg-tm-tint lg:px-[22px] [animation-duration:0.5s]"
        >
          <span className="flex items-center gap-2">
            <Plus weight="bold" className="size-4 shrink-0" aria-hidden />
            Add another item
          </span>
          <span className="text-[13px] font-medium text-tm-text-3">Same week, same box</span>
        </Link>

        <BagDeliverToCard delivery={bag.delivery} zones={zones} addresses={addresses} isSignedIn={isSignedIn} />
      </div>

      <BagSummaryCard
        view={bag}
        now={now}
        paymentChannels={paymentChannels}
        paymentHoldNote={paymentHoldNote}
        payment={payment}
        blocked={blocked}
      />

      <BagPayBar
        totalGhs={bag.total_ghs}
        verb="pay"
        busy={payment.busy}
        disabled={blocked}
        onPay={payment.payBag}
        countdown={formatLockCountdown(bag.rate_locked_until, now)}
      />

      {/*
        Mounted once for the whole bag rather than per line: only one line can be
        described at a time, and a dialog per row would put N of them in the DOM.
      */}
      <AssistedRequestDialog
        open={describing != null}
        onOpenChange={(next) => !next && setDescribing(null)}
        extractionRequestId={describing?.pending?.request_id ?? null}
        productUrl={describing?.product.url ?? null}
        displayUrl={describing?.product.url ?? ""}
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

/**
 * A group of lines that are not in a box: either still being read, or read but
 * unpriceable. Same shape as a box card without the meter, because there is no
 * weight to measure yet.
 */
function UnboxedGroup({
  label,
  lines,
  delay,
  now,
  busyLineId,
  onQuantity,
  onWatchInstead,
  onRemove,
  onDescribeIt,
  notifies,
}: {
  label: string;
  lines: BagLine[];
  delay: number;
  now: Date;
  busyLineId: string | null;
  onQuantity: (line: BagLine, quantity: number) => void;
  onWatchInstead: (line: BagLine) => void;
  onRemove: (line: BagLine) => void;
  onDescribeIt: (line: BagLine) => void;
  notifies: boolean;
}) {
  return (
    <section
      aria-label={label}
      className="tm-up overflow-hidden rounded-[24px] border border-tm-border bg-card [animation-duration:0.5s]"
      style={{ animationDelay: `${delay.toFixed(2)}s` }}
    >
      <header className="px-[18px] py-4 text-sm leading-none font-bold text-tm-text-2 lg:px-[22px]">{label}</header>
      <ul>
        {lines.map((line) => (
          <BagLineRow
            key={line.id}
            line={line}
            now={now}
            busy={busyLineId === line.id}
            onQuantity={(q) => onQuantity(line, q)}
            onWatchInstead={() => onWatchInstead(line)}
            onRemove={() => onRemove(line)}
            onDescribeIt={() => onDescribeIt(line)}
            notifies={notifies}
          />
        ))}
      </ul>
    </section>
  );
}
