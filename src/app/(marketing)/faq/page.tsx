import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, WhatsappLogo } from "@phosphor-icons/react/ssr";

import { getSiteContentByKind } from "@/db/queries/site-content";
import { whatsappHref } from "@/components/layout/marketing/links";
import { getMarketingSettings } from "@/features/marketing/services";
import { cn } from "@/lib/utils";
import { Eyebrow, MARKETING_GUTTER } from "../_components/marketing-primitives";
import { FaqList } from "./_components/faq-list";

export const metadata: Metadata = {
  title: "Questions · Tomame",
  description:
    "What people ask before their first order: how the price is worked out, which stores we buy from, how long delivery takes, and what happens if an item cannot be sourced.",
};

/**
 * `/faq` — linked from the signed-out nav.
 *
 * Rewritten because the old page was a 333-line client component that hardcoded
 * every question and answer in JSX, and several of them were not true:
 *
 * - It listed Alibaba, ASOS, Zara and H&M among the stores customers could buy
 *   from, and claimed "100+ global retailers". Only the USA lane is open — UK
 *   and China are disabled behind a waitlist (approved, `phase-2-handoff.md` §8)
 *   — so it was advertising a product Tomame does not sell.
 * - It offered "air freight options for urgent items", which do not exist.
 * - It still named Vodafone Cash and AirtelTigo Money, both rebranded.
 *
 * The questions now come from `site_content` kind `faq` — the same rows the
 * landing page's FAQ rail renders, which are current and which an admin can edit
 * without a deploy. Fewer answers that are true beats more that are not.
 */
export default async function FaqPage() {
  const [faqs, settings] = await Promise.all([
    getSiteContentByKind("faq"),
    getMarketingSettings(),
  ]);

  const chatHref = whatsappHref(settings.whatsappNumber);

  return (
    <div className={cn(MARKETING_GUTTER, "flex flex-col gap-12 py-16 md:py-24")}>
      <header className="flex max-w-[640px] flex-col gap-4">
        <Eyebrow>Questions</Eyebrow>
        <h1 className="text-[clamp(2rem,5vw,46px)] leading-[1.02] font-bold tracking-[-0.02em]">
          Things people ask before their first order.
        </h1>
        <p className="text-base leading-[1.55] text-tm-text-2">
          If yours is not here, ask a human. We answer on WhatsApp
          {settings.supportHours ? `, ${settings.supportHours}` : ""}.
        </p>
      </header>

      <FaqList faqs={faqs} />

      <footer className="flex flex-col gap-4 rounded-[24px] border border-tm-border bg-card p-7 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-lg leading-tight font-bold">Still stuck?</p>
          <p className="text-sm leading-[1.5] text-tm-text-2">
            Tell us what you are trying to buy and we will price it for you.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {chatHref && (
            <a
              href={chatHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-tm-border bg-card px-4 text-sm font-semibold",
                "transition-colors hover:border-tm-coral/40 hover:bg-tm-tint",
                "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/30",
              )}
            >
              <WhatsappLogo weight="fill" className="size-4.5 text-tm-green" aria-hidden />
              Chat on WhatsApp
            </a>
          )}
          <Link
            href="/contact"
            className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-tm-coral transition-colors hover:underline"
          >
            Send a message
            <ArrowRight weight="bold" className="size-4" aria-hidden />
          </Link>
        </div>
      </footer>
    </div>
  );
}
