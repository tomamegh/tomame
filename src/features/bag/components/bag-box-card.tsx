"use client";

import Link from "next/link";
import { Lightbulb, Package } from "@phosphor-icons/react/ssr";

import type { BagBox, BagLine } from "../types";
import { BagLineRow } from "./bag-line-row";
import { formatBoxFill, formatBoxHeadroom, formatBoxTitle } from "./format";

export interface BagBoxCardProps {
  box: BagBox;
  lines: BagLine[];
  busyLineId: string | null;
  onQuantity: (line: BagLine, quantity: number) => void;
  onWatchInstead: (line: BagLine) => void;
  onRemove: (line: BagLine) => void;
  /** Card index, for the mock's stagger: the first card is `.08s`. */
  index: number;
}

/**
 * One consolidation box — `v2-bag` lines 217–234. Gradient header
 * (`#FFF1EC → #FFF7EA`) with the package glyph, "Box 1 · flies from the US Fri
 * 12 Sep", the 120×6 meter whose fill is `scaleX` from the server's fill
 * percentage (`tmFill 1.2s .4s`), the lines, and the dashed footer with the
 * headroom and the price-watch nudge.
 */
export function BagBoxCard({ box, lines, busyLineId, onQuantity, onWatchInstead, onRemove, index }: BagBoxCardProps) {
  const delay = `${(0.08 + index * 0.06).toFixed(2)}s`;
  return (
    <section
      data-testid="bag-box"
      aria-label={box.label}
      className="tm-up overflow-hidden rounded-[24px] border border-tm-border bg-card [animation-duration:0.5s]"
      style={{ animationDelay: delay }}
    >
      {/* The meter sits beside the title from `sm` up; at 390px it drops beneath it rather than squeezing both. */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 bg-[linear-gradient(90deg,#FFF1EC,#FFF7EA)] px-[18px] py-4 lg:px-[22px]">
        <span className="flex items-center gap-2.5 text-sm leading-none font-bold">
          <Package weight="duotone" className="size-5 text-tm-coral" aria-hidden />
          {formatBoxTitle(box)}
        </span>
        <span className="flex items-center gap-2 text-xs leading-none font-medium text-tm-text-2">
          <span
            role="progressbar"
            aria-label={`Box fill ${box.fill_pct}%`}
            aria-valuenow={box.fill_pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="inline-block h-1.5 w-[120px] overflow-hidden rounded-[3px] bg-card"
          >
            <span
              data-testid="bag-box-fill"
              className="block h-full origin-left bg-tm-coral [animation:tmFill_1.2s_.4s_cubic-bezier(.16,1,.3,1)_both]"
              style={{ width: `${box.fill_pct}%` }}
            />
          </span>
          <span className="tm-nums">{formatBoxFill(box)}</span>
        </span>
      </header>

      <ul>
        {lines.map((line) => (
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

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-dashed border-[#E8DDD6] px-[18px] py-3.5 text-[13px] leading-none font-medium text-tm-text-2 lg:px-[22px]">
        <span className="flex min-w-0 flex-1 items-center gap-2 leading-[1.4]">
          <Lightbulb weight="duotone" className="size-[18px] shrink-0 text-tm-amber" aria-hidden />
          {formatBoxHeadroom(box)}
        </span>
        <Link href="/app/watches" className="shrink-0 text-[13px] leading-none font-semibold text-tm-coral hover:underline">
          See watch list →
        </Link>
      </footer>
    </section>
  );
}
