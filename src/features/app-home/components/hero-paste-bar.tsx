"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, LinkSimple } from "@phosphor-icons/react/ssr";

import { StoreCycler } from "@/components/marketing/landing/store-cycler";
import { cn } from "@/lib/utils";

/** The public quote flow. It reads `?url=`, extracts and prices server-side. */
const QUOTE_ROUTE = "/app/orders/new";

/** The mock's placeholder line is 16px text on a 20px row. */
const WORD_ROW_HEIGHT = 20;

export interface HeroPasteBarProps {
  /**
   * Store display names from the scraper registry — never a literal list in
   * JSX. Passed down from the server page so the registry (and the scrapers it
   * pulls in) stays out of the client bundle.
   */
  stores: readonly string[];
  className?: string;
}

/**
 * The Home hero's paste bar — the only interactive island on this screen.
 *
 * It hands the link straight to the existing quote flow; no extraction, no
 * pricing and no validation of money happens here. The animated placeholder is
 * an aria-hidden overlay rather than a real `placeholder` attribute, because a
 * placeholder attribute cannot contain a moving element; the input keeps a
 * proper visually-hidden `<label>` so it is still announced.
 */
export function HeroPasteBar({ stores, className }: HeroPasteBarProps) {
  const router = useRouter();
  const [value, setValue] = useState("");

  const isEmpty = value.trim().length === 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    router.push(
      trimmed
        ? `${QUOTE_ROUTE}?url=${encodeURIComponent(trimmed)}`
        : QUOTE_ROUTE,
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex flex-col gap-2 rounded-[18px] border-[1.5px] border-tm-border bg-card p-1.5",
        "shadow-[0_8px_30px_-12px_rgba(242,91,61,0.25)] focus-within:border-tm-coral/50",
        "sm:h-[62px] sm:flex-row sm:items-center sm:gap-0 sm:pl-[18px]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-0 px-3 py-2 sm:px-0 sm:py-0">
        <LinkSimple
          weight="duotone"
          className="size-[22px] shrink-0 text-tm-coral"
          aria-hidden
        />
        <div className="relative min-w-0 flex-1 px-3.5">
          <label htmlFor="home-product-url" className="sr-only">
            Product link
          </label>
          <input
            id="home-product-url"
            name="url"
            // Deliberately `text`, not `url`: a mistyped link should reach the
            // server and come back with our own error message, rather than
            // being stopped by a native validation bubble the design never
            // accounted for.
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="w-full min-w-0 bg-transparent text-base leading-none text-tm-ink outline-none"
          />
          {isEmpty && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center gap-1.5 overflow-hidden px-3.5 text-base leading-none whitespace-nowrap text-tm-text-3"
            >
              Paste a link from
              <StoreCycler
                stores={stores}
                rowHeight={WORD_ROW_HEIGHT}
                className="text-base"
              />
              {/*
                The mock's tail here is "— or describe it". Dropped: the
                extractor takes a product URL and rejects free text, so the
                offer would be false. Same rule as the mock's "Rate locked 24h"
                chip — don't promise what nothing backs. Restore it when a
                describe-it intake actually exists.
              */}
            </span>
          )}
        </div>
      </div>
      <button
        type="submit"
        className={cn(
          "tm-cta-gradient inline-flex h-[50px] shrink-0 items-center justify-center gap-2 rounded-[13px] px-[22px]",
          "text-[15px] leading-none font-bold transition-transform hover:scale-[1.02] active:scale-[0.99]",
          "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/40 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
        )}
      >
        Get landed price
        <ArrowRight weight="bold" className="size-4" aria-hidden />
      </button>
    </form>
  );
}
