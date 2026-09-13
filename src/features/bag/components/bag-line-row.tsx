"use client";

import Image from "next/image";
import { BookmarkSimple, Minus, Plus, X } from "@phosphor-icons/react/ssr";

import { safeImageSrc } from "@/features/app-home/components/format";
import { formatGhs } from "@/features/marketing/format";
import { cn } from "@/lib/utils";
import type { BagLine } from "../types";
import { formatLineMeta, formatLineUsd } from "./format";

export interface BagLineRowProps {
  line: BagLine;
  busy: boolean;
  onQuantity: (quantity: number) => void;
  onWatchInstead: () => void;
  onRemove: () => void;
}

/** The mock's empty thumb: a diagonal hatch in the tint palette (line 221). */
const THUMB_PLACEHOLDER =
  "bg-[repeating-linear-gradient(135deg,#F6EDE7_0_6px,#EFE4DC_6px_12px)]";

/**
 * One bag line — `v2-bag` lines 219–232: `84px 1fr auto` grid, 84px thumb at
 * 14px radius, name `600 15px/1.3`, meta `400 13px/1`, a 32px stepper pill,
 * "Watch instead" and "Remove", the GH₵ total at `700 18px/1` with the USD echo.
 *
 * Every figure is the server's re-priced breakdown for this line; a line the
 * server could not price shows its reason where the money would be.
 */
export function BagLineRow({ line, busy, onQuantity, onWatchInstead, onRemove }: BagLineRowProps) {
  const src = safeImageSrc(line.product.image);
  const meta = formatLineMeta(line);
  const usd = formatLineUsd(line);
  const title = line.product.title ?? "Product from link";

  return (
    <li
      data-testid="bag-line"
      className="grid grid-cols-[84px_1fr_auto] items-center gap-[18px] border-t border-tm-hairline px-[22px] py-[18px]"
    >
      <div className={cn("relative size-[84px] overflow-hidden rounded-[14px]", !src && THUMB_PLACEHOLDER)}>
        {src && <Image src={src} alt="" fill sizes="84px" className="object-contain p-1" />}
      </div>

      <div className="flex min-w-0 flex-col gap-[7px]">
        <a
          href={line.product.url || undefined}
          target="_blank"
          rel="noreferrer"
          className="truncate text-[15px] leading-[1.3] font-semibold text-tm-ink hover:underline"
          title={title}
        >
          {title}
        </a>
        {meta && <span className="text-[13px] leading-none text-tm-text-3">{meta}</span>}
        {line.special_instructions && (
          <span className="truncate text-[12px] leading-none text-tm-text-3">Note: {line.special_instructions}</span>
        )}

        <div className="mt-0.5 flex items-center gap-[14px]">
          <div className="flex h-8 items-center rounded-full border border-tm-border px-[3px]">
            <StepperButton label="Decrease quantity" disabled={busy || line.quantity <= 1} onClick={() => onQuantity(line.quantity - 1)}>
              <Minus className="size-3" aria-hidden />
            </StepperButton>
            <output aria-live="polite" className="tm-nums w-7 text-center text-[13px] leading-none font-semibold">
              {line.quantity}
            </output>
            <StepperButton label="Increase quantity" disabled={busy || line.quantity >= 100} onClick={() => onQuantity(line.quantity + 1)}>
              <Plus className="size-3" aria-hidden />
            </StepperButton>
          </div>

          <button
            type="button"
            onClick={onWatchInstead}
            disabled={busy || !line.product.url}
            className="inline-flex items-center gap-[5px] text-[13px] leading-none font-medium text-tm-text-2 transition-colors hover:text-tm-ink disabled:opacity-60"
          >
            <BookmarkSimple className="size-[14px]" aria-hidden />
            Watch instead
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="inline-flex items-center gap-[5px] text-[13px] leading-none font-medium text-tm-text-2 transition-colors hover:text-tm-ink disabled:opacity-60"
          >
            <X className="size-[14px]" aria-hidden />
            Remove
          </button>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 text-right">
        {line.pricing ? (
          <>
            <span className="tm-nums text-[18px] leading-none font-bold">{formatGhs(line.pricing.total_ghs)}</span>
            {usd && <span className="tm-nums text-[12px] leading-none font-medium text-tm-text-3">{usd}</span>}
          </>
        ) : (
          <span className="max-w-[180px] text-[12px] leading-[1.4] font-medium text-tm-amber">
            {line.pricing_unavailable_reason ?? "Not priced"}
          </span>
        )}
      </div>
    </li>
  );
}

function StepperButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-[26px] items-center justify-center rounded-full bg-[#FDF5F1] text-tm-ink transition-colors hover:bg-tm-tint disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
