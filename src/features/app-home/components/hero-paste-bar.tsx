"use client";

import Link from "next/link";

import { buyForMeHref } from "@/features/extraction/components/buy-for-me-mode";
import { AskBar } from "@/features/finder/components/ask-bar";
import { cn } from "@/lib/utils";

/** The public quote flow. It reads `?url=`, extracts and prices server-side. */
const QUOTE_ROUTE = "/app/orders/new";

export interface HeroPasteBarProps {
  /** Store display names from the scraper registry, passed down from the server page. */
  stores: readonly string[];
  /** How many products the catalogue holds; zero hides "search what we have already priced". */
  catalogueCount?: number;
  className?: string;
}

/**
 * The Home hero's ask box: words start the AI price finder, links go to the
 * quote flow (see `AskBar`). The form's `id` is stop one of the first-run tour
 * (`src/features/onboarding`).
 */
export function HeroPasteBar({ stores, catalogueCount = 0, className }: HeroPasteBarProps) {
  return (
    <AskBar
      pasteHref={QUOTE_ROUTE}
      stores={stores}
      inputId="home-product-url"
      formId="onboarding-tour-ask"
      className={cn(className)}
      footer={(typed, describing) =>
        describing && catalogueCount > 0 ? (
          <Link
            href={buyForMeHref("browse", { q: typed })}
            className="w-fit rounded px-2 text-[13px] font-semibold text-tm-coral-strong underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-tm-coral/40"
          >
            Or browse what we have already priced
          </Link>
        ) : null
      }
    />
  );
}
