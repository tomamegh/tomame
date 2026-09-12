"use client";

import type { Icon } from "@phosphor-icons/react";
import {
  Scales,
  SealCheck,
  Star,
  Storefront,
  Tag,
  Warning,
} from "@phosphor-icons/react/ssr";

import type { ScrapedProduct } from "@/features/extraction/types";
import { buildSpecChips, pickProductColour, type SpecChipIcon } from "./format";

/** One duotone glyph per spec chip, keyed by the fact the builder emitted. */
const CHIP_ICONS: Record<SpecChipIcon, Icon> = {
  seller: Storefront,
  brand: Tag,
  condition: SealCheck,
  weight: Scales,
  rating: Star,
};

export interface ProductFactsProps {
  product: ScrapedProduct;
  productUrl: string;
  /** `ExtractionResult.messages` — what the extractor could not read. */
  messages: readonly string[];
}

/**
 * Title, spec chips and the extractor's own caveats.
 *
 * Every chip is conditional on its field being non-null, so a thin extraction
 * renders a short row rather than a full one with invented values. The title
 * falls back to the URL, which is the only other thing we actually know.
 */
export function ProductFacts({
  product,
  productUrl,
  messages,
}: ProductFactsProps) {
  const chips = buildSpecChips(product);
  const availability = product.availability?.trim();

  return (
    <div className="flex flex-col gap-3.5 lg:gap-2.5">
      <h1 className="font-display text-[20px] leading-[1.2] font-bold sm:text-[24px] sm:leading-[1.15] lg:text-[30px] lg:leading-[1.15]">
        {product.title ?? productUrl}
      </h1>

      {(chips.length > 0 || availability) && (
        <ul className="flex flex-wrap gap-1.5 lg:gap-2">
          {chips.map((chip) => {
            const ChipIcon = CHIP_ICONS[chip.icon];
            return (
              /*
                The 390px artboard drops the key and the glyph and keeps only
                the value, so the chip row fits a phone without wrapping to
                three lines. Same markup at both widths — the label and icon
                are simply not shown below `lg`.
              */
              <li
                key={chip.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-tm-border bg-card px-2.5 py-1.5 text-[12px] leading-none font-medium text-tm-text-2 lg:px-3 lg:py-2 lg:text-[13px] lg:leading-none"
              >
                <ChipIcon
                  weight="duotone"
                  className="hidden size-[15px] shrink-0 text-tm-coral lg:block"
                  aria-hidden
                />
                <span className="hidden lg:inline">{chip.label} </span>
                <b className="tm-nums font-medium text-tm-text-2 lg:font-semibold lg:text-tm-ink">
                  {chip.value}
                </b>
              </li>
            );
          })}

          {/*
            The store's own availability phrase, verbatim — "In Stock",
            "Only 3 left in stock". The artboard puts it only on the 390px
            view, where it is the one fact a customer checks before paying and
            there is no room for a labelled chip; the desktop mock has no such
            chip and keeps its labelled row unchanged.
          */}
          {availability && (
            <li className="inline-flex items-center rounded-full bg-tm-green-bg px-2.5 py-1.5 text-[12px] leading-none font-semibold text-tm-green-ink lg:hidden">
              {availability}
            </li>
          )}
        </ul>
      )}

      {messages.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-[14px] bg-tm-amber-bg px-3.5 py-3">
          {messages.map((message) => (
            <li
              key={message}
              className="flex items-start gap-2 text-[13px] leading-[1.45] font-medium text-tm-text-2"
            >
              <Warning
                weight="duotone"
                className="mt-px size-4 shrink-0 text-tm-amber"
                aria-hidden
              />
              {message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface ProductColourCardProps {
  product: ScrapedProduct;
}

/**
 * Colour as TEXT.
 *
 * The mock draws swatches; we do not. A store publishes a colour *name*
 * ("Midnight", "Starlight") and nothing in the pipeline or the database turns
 * that into a hex value, so a swatch would be a colour we invented printed
 * beside a price the customer is about to pay. Returns null — no empty card —
 * when the listing states no colour at all.
 */
export function ProductColourCard({ product }: ProductColourCardProps) {
  const colour = pickProductColour(product);
  if (!colour) return null;

  return (
    <section className="flex flex-col gap-3 rounded-[18px] border border-tm-border bg-card p-[18px]">
      <h2 className="text-sm leading-none font-semibold">
        Colour
        {colour.selected && (
          <span className="font-normal text-tm-text-3"> · {colour.selected}</span>
        )}
      </h2>

      {colour.options.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {colour.options.map((option) => {
            const isSelected =
              colour.selected != null &&
              option.toLowerCase() === colour.selected.toLowerCase();
            return (
              <li
                key={option}
                className={
                  isSelected
                    ? "rounded-full border border-tm-coral bg-tm-tint px-3 py-1.5 text-xs leading-none font-semibold text-tm-coral-strong"
                    : "rounded-full border border-tm-border bg-[var(--tm-pill-bg)] px-3 py-1.5 text-xs leading-none font-medium text-tm-text-2"
                }
              >
                {option}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export interface BuyerNoteCardProps {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
}

/**
 * "Tell the buyer · optional" — the free-text note that travels to the order as
 * `special_instructions`. The cap is the one `createOrderSchema` enforces, so
 * the field cannot accept text the API would reject.
 */
export function BuyerNoteCard({
  value,
  onChange,
  maxLength,
}: BuyerNoteCardProps) {
  return (
    <section className="flex flex-col gap-3 rounded-[18px] border border-tm-border bg-card p-[18px]">
      <label
        htmlFor="quote-buyer-note"
        className="text-sm leading-none font-semibold"
      >
        Tell the buyer <span className="font-normal text-tm-text-3">· optional</span>
      </label>
      <textarea
        id="quote-buyer-note"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        rows={2}
        placeholder="e.g. only if sold by Amazon, not a 3rd-party seller"
        className="min-h-[44px] flex-1 resize-none rounded-[10px] border border-dashed border-[#E8DDD6] px-3 py-2.5 text-[13px] leading-[1.4] font-normal text-tm-ink placeholder:text-tm-text-3 focus-visible:border-tm-coral focus-visible:outline-none"
      />
    </section>
  );
}
