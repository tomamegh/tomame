"use client";

import Image from "next/image";
import { BookmarkSimple, ChatCircleText, CheckCircle, CircleNotch, Minus, Plus, X } from "@phosphor-icons/react/ssr";

import { safeImageSrc } from "@/features/app-home/components/format";
import { formatGhs } from "@/features/marketing/format";
import { cn } from "@/lib/utils";
import type { BagLine } from "../types";
import { describePendingWait, formatLineMeta, formatLineUsd, hostOf } from "./format";

export interface BagLineRowProps {
  line: BagLine;
  /** One clock for the whole render, so every pending line agrees about how long it has been. */
  now: Date;
  busy: boolean;
  onQuantity: (quantity: number) => void;
  onWatchInstead: () => void;
  onRemove: () => void;
  /** Offered once waiting stops being reasonable — see `describePendingWait`. */
  onDescribeIt: () => void;
  /** Whether a finished paste will reach this viewer — signed-in only. Shapes the wait copy. */
  notifies: boolean;
}

/** The mock's empty thumb: a diagonal hatch in the tint palette (line 221). */
const THUMB_PLACEHOLDER =
  "bg-[repeating-linear-gradient(135deg,#F6EDE7_0_6px,#EFE4DC_6px_12px)]";

/**
 * One bag line — `v2-bag` lines 219–232: `84px 1fr auto` grid, 84px thumb at
 * 14px radius, name `600 15px/1.3`, meta `400 13px/1`, a 32px stepper pill,
 * "Watch instead" and "Remove", the GH₵ total at `700 18px/1` with the USD echo.
 *
 * At 390px that grid has nowhere to go: a five-figure cedi total takes a third
 * of the width and leaves the name as an ellipsis. So the row stacks below
 * `lg` — thumb beside the name, then the price, then the controls — and
 * `lg:contents` dissolves the mobile cluster back into the artboard's three
 * columns from `lg` up, where the thumb and the price span both rows exactly as
 * they do in the mock.
 *
 * Every figure is the server's re-priced breakdown for this line; a line the
 * server could not price shows its reason where the money would be.
 */
export function BagLineRow({
  line,
  now,
  busy,
  onQuantity,
  onWatchInstead,
  onRemove,
  onDescribeIt,
  notifies,
}: BagLineRowProps) {
  const src = safeImageSrc(line.product.image);
  const meta = formatLineMeta(line);
  const usd = formatLineUsd(line);
  const wait = line.pending ? describePendingWait(line.pending, now, { notifies }) : null;
  const title = line.product.title ?? (line.pending ? hostOf(line.product.url) : "Product from link");

  return (
    <li
      data-testid="bag-line"
      className={cn(
        // `grid-cols-1` is load-bearing: an implicit grid column is `auto`, so
        // a long product name would size the row to its own max-content and
        // push the whole page wider than the phone.
        "grid grid-cols-1 gap-3 border-t border-tm-hairline px-[18px] py-4",
        "lg:grid-cols-[84px_1fr_auto] lg:items-center lg:gap-x-[18px] lg:gap-y-[7px] lg:px-[22px] lg:py-[18px]",
      )}
    >
      {/* Thumb + name travel together on a phone; from `lg` they are two of the artboard's columns. */}
      <div className="flex items-start gap-3.5 lg:contents">
        <div
          className={cn(
            "relative size-16 shrink-0 overflow-hidden rounded-[14px] lg:size-[84px] lg:row-span-2 lg:self-center",
            !src && THUMB_PLACEHOLDER,
          )}
        >
          {src && (
            <Image
              src={src}
              alt=""
              fill
              sizes="(min-width: 1024px) 84px, 64px"
              className="object-contain p-1"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[7px] lg:col-start-2 lg:row-start-1 lg:flex-none">
          <a
            href={line.product.url || undefined}
            target="_blank"
            rel="noreferrer"
            className="truncate text-[15px] leading-[1.3] font-semibold text-tm-ink hover:underline"
            title={title}
          >
            {title}
          </a>
          {wait ? (
            <span className="flex flex-col gap-1">
              <span
                className={cn(
                  "flex items-center gap-1.5 text-[13px] leading-none font-medium",
                  wait.phase === "failed" && "text-tm-amber",
                  wait.phase === "assisted" && "text-tm-green",
                  wait.phase !== "failed" && wait.phase !== "assisted" && "text-tm-text-2",
                )}
              >
                {wait.phase === "assisted" ? (
                  <CheckCircle weight="fill" className="size-3.5 shrink-0" aria-hidden />
                ) : wait.phase !== "failed" ? (
                  <CircleNotch
                    className="size-3.5 shrink-0 animate-spin text-tm-coral"
                    aria-hidden
                  />
                ) : null}
                {wait.title}
              </span>
              {wait.detail && (
                <span className="text-xs leading-[1.4] text-tm-text-3">
                  {wait.detail}
                </span>
              )}
            </span>
          ) : (
            meta && (
              <span className="text-[13px] leading-none text-tm-text-3">
                {meta}
              </span>
            )
          )}
          {line.special_instructions && (
            <span className="truncate text-[12px] leading-none text-tm-text-3">
              Note: {line.special_instructions}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-start gap-1 lg:col-start-3 lg:row-span-2 lg:items-end lg:self-center lg:text-right">
        {line.pending ? (
          <span className="text-xs leading-[1.4] font-medium text-tm-text-3">
            Price to follow
          </span>
        ) : line.sourcing && line.sourcing.status !== "available" ? (
          /*
            A line a PERSON is answering (065). Deliberately not the amber
            "could not be priced" treatment the generic unpriced line gets:
            that one reads as a fault the customer should fix, and this is a
            promise we have made them. Nothing they can do either way, so the
            copy says who is doing it instead.
          */
          <span className="max-w-[190px] text-[12px] leading-[1.4] font-medium text-tm-text-2">
            {line.sourcing.status === "unavailable" ? (
              <>
                <span className="font-semibold text-tm-amber">We cannot get this one.</span>{" "}
                {line.sourcing.note ?? "Take it out of your bag to carry on."}
              </>
            ) : (
              <>
                <span className="font-semibold text-tm-ink">With our team.</span>{" "}
                We are pricing this by hand and will tell you the moment you can
                pay for it.
              </>
            )}
          </span>
        ) : line.pricing ? (
          <>
            <span className="tm-nums text-[18px] leading-none font-bold">
              {formatGhs(line.pricing.total_ghs)}
            </span>
            {usd && (
              <span className="tm-nums text-[12px] leading-none font-medium text-tm-text-3">
                {usd}
              </span>
            )}
          </>
        ) : (
          <span className="max-w-[180px] text-[12px] leading-[1.4] font-medium text-tm-amber">
            {line.pricing_unavailable_reason ?? "Not priced"}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-[14px] gap-y-2.5 lg:col-start-2 lg:row-start-2 lg:mt-0.5 lg:flex-nowrap">
        <div className="flex h-8 items-center rounded-full border border-tm-border px-[3px]">
          <StepperButton
            label="Decrease quantity"
            disabled={busy || line.quantity <= 1}
            onClick={() => onQuantity(line.quantity - 1)}
          >
            <Minus className="size-3" aria-hidden />
          </StepperButton>
          <output
            aria-live="polite"
            className="tm-nums w-7 text-center text-[13px] leading-none font-semibold"
          >
            {line.quantity}
          </output>
          <StepperButton
            label="Increase quantity"
            disabled={busy || line.quantity >= 100}
            onClick={() => onQuantity(line.quantity + 1)}
          >
            <Plus className="size-3" aria-hidden />
          </StepperButton>
        </div>

        {wait && (wait.phase === "stuck" || wait.phase === "failed") && (
          <button
            type="button"
            onClick={onDescribeIt}
            className="inline-flex items-center gap-[5px] text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:underline"
          >
            <ChatCircleText weight="bold" className="size-[14px]" aria-hidden />
            Describe it instead
          </button>
        )}

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
    </li>
  );
}

function StepperButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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
