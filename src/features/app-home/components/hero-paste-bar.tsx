"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, LinkSimple, Sparkle } from "@phosphor-icons/react/ssr";

import { StoreCycler } from "@/components/marketing/landing/store-cycler";
import { buyForMeHref } from "@/features/extraction/components/buy-for-me-mode";
import { linksInText } from "@/features/extraction/components/batch-format";
import { PASTE_BATCH_MAX } from "@/features/extraction/services/paste-batch";
import { useStartFinder } from "@/features/finder/hooks/useFinder";
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
  /**
   * How many products the pre-scraped catalogue holds. Zero turns the box back
   * into a paste-only box: offering to search a catalogue of nothing is a dead
   * end, and the copy would be a promise nothing backs.
   */
  catalogueCount?: number;
  className?: string;
}

/**
 * The Home hero's ask box — the only interactive island on this screen.
 *
 * ONE BOX, BOTH JOBS. A link is handed to the quote flow, which reads and
 * prices it; anything else is a search over the pre-priced catalogue. That is
 * the same fork `paste-queue-view.tsx` already makes with the same helper, so
 * the two screens cannot disagree about what a given string means — and it is
 * what Kelvin asked the signed-in Home to do: "be allowed to post a link or
 * search and buy".
 *
 * WHICH BRANCH IS ARMED IS VISIBLE BEFORE ANYBODY PRESSES. The icon, the
 * placeholder and the button label all follow `looksLikeUrl`, so the box never
 * silently does the other thing.
 *
 * No extraction, no pricing and no validation of money happens here. The
 * animated placeholder is an aria-hidden overlay rather than a real
 * `placeholder` attribute, because a placeholder attribute cannot contain a
 * moving element; the input keeps a proper visually-hidden `<label>` so it is
 * still announced.
 *
 * The form's `id` is stop one's anchor for the first-run tour
 * (`src/features/onboarding`) — "here is where you say what you want".
 */
export function HeroPasteBar({ stores, catalogueCount = 0, className }: HeroPasteBarProps) {
  const router = useRouter();
  const [value, setValue] = useState("");

  const typed = value.trim();
  const isEmpty = typed.length === 0;
  const typedLinks = linksInText(typed);
  const isLink = typedLinks.length > 0;
  const canSearch = catalogueCount > 0;
  // Words, not a link: "Find it for me" starts a price finder run (105).
  const describing = !isEmpty && !isLink;
  const finder = useStartFinder();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isEmpty) {
      router.push(QUOTE_ROUTE);
      return;
    }
    if (describing) {
      finder.start(typed);
      return;
    }
    const params = new URLSearchParams();
    for (const link of typedLinks.slice(0, PASTE_BATCH_MAX)) params.append("url", link);
    router.push(`${QUOTE_ROUTE}?${params.toString()}`);
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <form
        id="onboarding-tour-ask"
        onSubmit={handleSubmit}
        className={cn(
          "flex flex-col gap-2 rounded-[18px] border-[1.5px] border-tm-border bg-card p-1.5",
          "shadow-[0_8px_30px_-12px_rgba(242,91,61,0.25)] focus-within:border-tm-coral/50",
          "sm:h-[62px] sm:flex-row sm:items-center sm:gap-0 sm:pl-[18px]",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-0 px-3 py-2 sm:px-0 sm:py-0">
          {describing ? (
            <Sparkle
              weight="fill"
              className="size-[22px] shrink-0 text-tm-coral"
              aria-hidden
            />
          ) : (
            <LinkSimple
              weight="duotone"
              className="size-[22px] shrink-0 text-tm-coral"
              aria-hidden
            />
          )}
          <div className="relative min-w-0 flex-1 px-3.5">
            <label htmlFor="home-product-url" className="sr-only">
              Product link, or what you are looking for
            </label>
            <input
              id="home-product-url"
              name="url"
              // Deliberately `text`, not `url`: a mistyped link should reach the
              // server and come back with our own error message, rather than
              // being stopped by a native validation bubble the design never
              // accounted for.
              type="text"
              // `url` only while it still could be one. Locking the keyboard to a
              // URL layout would put somebody typing "wireless earbuds" behind a
              // `.com` key and no space bar.
              inputMode={describing ? "search" : "url"}
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
                  The mock's tail here was "— or describe it", and it was dropped
                  because the extractor takes a product URL and rejects free text,
                  so the offer was false. This tail is a different promise and the
                  catalogue backs it: words go to the search over the products we
                  have already read and priced. It is drawn only when there is a
                  catalogue to search, for the same reason the old one was cut.
                */}
                <span className="hidden truncate sm:inline">or describe it</span>
              </span>
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={finder.pending}
          aria-busy={finder.pending || undefined}
          className={cn(
            "tm-cta-gradient inline-flex h-[50px] shrink-0 items-center justify-center gap-2 rounded-[13px] px-[22px]",
            "text-[15px] leading-none font-bold transition-transform hover:scale-[1.02] active:scale-[0.99]",
            "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/40 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
            "disabled:cursor-wait disabled:opacity-80 disabled:hover:scale-100",
          )}
        >
          {describing ? (finder.pending ? "Starting" : "Find it for me") : "Get landed price"}
          <ArrowRight weight="bold" className="size-4" aria-hidden />
        </button>
      </form>
      {finder.error ? (
        <p role="alert" className="px-2 text-[13px] font-medium text-destructive">
          {finder.error}
        </p>
      ) : (
        describing &&
        canSearch && (
          <Link href={buyForMeHref("browse", { q: typed })} className="w-fit rounded px-2 text-[13px] font-semibold text-tm-coral-strong underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-tm-coral/40">
            Or search what we have already priced
          </Link>
        )
      )}
    </div>
  );
}
