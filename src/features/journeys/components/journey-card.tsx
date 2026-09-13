"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, SpinnerGap } from "@phosphor-icons/react/ssr";

import type { JourneyRow } from "../types";
import { ctaLabel, formatGroupPosition, formatRowEyebrow, formatRowMeta } from "../format";
import { stageIcon, tonePalette } from "./stage-visuals";

export interface JourneyCardProps {
  row: JourneyRow;
  /** Card index within the visible list, for the mock's stagger. */
  index: number;
  /** True while this row's payment is being opened. */
  busy: boolean;
  onPay: (row: JourneyRow) => void;
  onBuyAgain: (row: JourneyRow) => void;
}

/**
 * One journey (`v2-journeys`, design lines 298–307).
 *
 * 64px thumbnail, eyebrow ("Amazon · TM-00042 · 28 Aug"), name, quantity and
 * total, the stage badge, the 10px progress bar and the hint/CTA footer.
 *
 * The bar's width is a STAGE POSITION from the server, never a guess in the
 * browser, and its `tmFill` is a `scaleX` — so the coloured span is laid out at
 * its final width and animated from zero, which is why the width lives in a
 * style and the animation in a class.
 *
 * Mock delays are literal: `tmUp .5s` starting at `.12s` and stepping `.06s`
 * per card (`.12 .18 .24 .3`), and the bar's `tmFill 1.1s .4s cubic-bezier(.16,1,.3,1)`.
 */
export function JourneyCard({ row, index, busy, onPay, onBuyAgain }: JourneyCardProps) {
  const tone = tonePalette(row.tone);
  const Glyph = stageIcon(row.status);
  const position = formatGroupPosition(row.groupPosition);
  const label = ctaLabel(row.cta);

  return (
    <article
      data-testid="journey-card"
      className="tm-up flex min-w-0 flex-col gap-3.5 rounded-[22px] border border-tm-border bg-card p-5 [animation-duration:0.5s]"
      style={{ animationDelay: `${(0.12 + index * 0.06).toFixed(2)}s` }}
    >
      <div className="flex items-center gap-3.5">
        <Thumbnail src={row.productImageUrl} alt="" />

        <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
          <span className="truncate text-[11px] leading-none font-semibold tracking-[0.04em] text-tm-text-3">
            {formatRowEyebrow(row.store, row.orderNo, row.createdAt)}
          </span>
          <p className="truncate text-[15px] leading-[1.3] font-semibold">
            {row.productName}
          </p>
          <span className="text-xs leading-none font-medium text-tm-text-2">
            {formatRowMeta(row.quantity, row.totalGhs)}
            {position && <span className="text-tm-text-3"> · {position}</span>}
          </span>
        </div>

        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs leading-none font-semibold whitespace-nowrap ${tone.badge} ${tone.text}`}
        >
          <Glyph weight="fill" className="size-3.5" aria-hidden />
          {row.stageLabel}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={`${row.stageLabel}, ${row.percent}% of the way`}
        aria-valuenow={row.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-1.5 overflow-hidden rounded-[5px] bg-[#F5EEE9] lg:h-2.5"
      >
        <span
          data-testid="journey-progress"
          className={`absolute inset-y-0 left-0 origin-left rounded-[5px] [animation:tmFill_1.1s_.4s_cubic-bezier(.16,1,.3,1)_both] ${tone.bar}`}
          style={{ width: `${row.percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        {/* Omitted entirely when nothing is known — never a placeholder sentence. */}
        <span className="min-w-0 truncate text-xs leading-none font-medium text-tm-text-3">
          {row.hint}
        </span>
        <JourneyCta row={row} label={label} busy={busy} onPay={onPay} onBuyAgain={onBuyAgain} />
      </div>
    </article>
  );
}

/**
 * "Pay now" and "Buy again" are actions; "Track" and "Details" are the same
 * destination under two words, so they are a link. Rendering all four as buttons
 * would cost the customer middle-click and open-in-new-tab on the two that are
 * navigation.
 */
function JourneyCta({
  row,
  label,
  busy,
  onPay,
  onBuyAgain,
}: {
  row: JourneyRow;
  label: string;
  busy: boolean;
  onPay: (row: JourneyRow) => void;
  onBuyAgain: (row: JourneyRow) => void;
}) {
  const className =
    "inline-flex shrink-0 items-center gap-1 text-[13px] leading-none font-semibold text-tm-coral disabled:opacity-60";

  if (row.cta === "pay" || row.cta === "buy_again") {
    return (
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => (row.cta === "pay" ? onPay(row) : onBuyAgain(row))}
      >
        {busy ? (
          <SpinnerGap className="size-4 animate-spin" aria-hidden />
        ) : null}
        {label}
        <ArrowRight weight="bold" className="size-3.5" aria-hidden />
      </button>
    );
  }

  return (
    <Link href={`/app/orders/${row.id}`} className={className}>
      {label}
      <ArrowRight weight="bold" className="size-3.5" aria-hidden />
      <span className="sr-only"> — {row.productName}</span>
    </Link>
  );
}

/**
 * The mock draws a diagonal hatch where the photo goes. A real listing has one,
 * so the hatch is what we fall back TO, not what we show by default.
 *
 * Store CDNs are already allowed wholesale in `next.config.ts`
 * (`hostname: "**"`), so these go through the optimiser like the bag's do.
 */
function Thumbnail({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <span
        aria-hidden
        className="size-[52px] shrink-0 rounded-[10px] bg-[repeating-linear-gradient(135deg,#F6EDE7_0_6px,#EFE4DC_6px_12px)] lg:size-16 lg:rounded-[14px]"
      />
    );
  }

  return (
    <span className="relative size-[52px] shrink-0 overflow-hidden rounded-[10px] bg-[repeating-linear-gradient(135deg,#F6EDE7_0_6px,#EFE4DC_6px_12px)] lg:size-16 lg:rounded-[14px]">
      <Image src={src} alt={alt} fill sizes="(min-width: 1024px) 64px, 52px" className="object-cover" />
    </span>
  );
}
