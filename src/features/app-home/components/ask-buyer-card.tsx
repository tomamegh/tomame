import Link from "next/link";
import { ArrowRight, ChatsCircle } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import type { HomeAskBuyer } from "../types";

/** Where a customer lands when no WhatsApp number is configured. */
const CONTACT_HREF = "/contact";

export interface AskBuyerCardProps {
  /**
   * From `site_settings`: `whatsapp_number` (already turned into a `wa.me`
   * href, or null) and `support_hours`.
   */
  askBuyer: HomeAskBuyer;
  className?: string;
}

/**
 * "Ask us" (was "Ask a buyer" — Kelvin's wording) — Row C, right column, bottom card.
 *
 * The card always renders, but never promises a channel that does not exist.
 * With a number configured it says a person answers on WhatsApp — adding the
 * real `support_hours` when they are published — and links out to `wa.me`.
 * With no number it falls back to the existing `/contact` page and rewords the
 * body and the link to match, rather than rendering a dead "Start a chat →"
 * onto `wa.me/`. Falling back beats hiding the card: a customer with a question
 * still needs somewhere to go, and `/contact` is a real, working destination.
 */
export function AskBuyerCard({ askBuyer, className }: AskBuyerCardProps) {
  const chatHref = askBuyer.whatsappHref;
  const hours = askBuyer.supportHours;

  const body = chatHref
    ? `Not sure about a size, seller or duty? A real person answers on WhatsApp${
        hours ? `, ${hours}` : ""
      }.`
    : `Not sure about a size, seller or duty? Send us the question and a real person answers${
        hours ? `, ${hours}` : ""
      }.`;

  return (
    <section
      aria-labelledby="home-ask-buyer-heading"
      className={cn(
        "tm-up flex min-w-0 flex-col gap-2.5 rounded-[24px] border border-tm-border bg-card p-[22px]",
        "[animation-delay:0.46s]",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-[12px] bg-tm-amber-bg text-tm-amber">
        <ChatsCircle weight="duotone" className="size-[22px]" aria-hidden />
      </span>

      <h3
        id="home-ask-buyer-heading"
        className="mt-1.5 font-display text-[17px] leading-[1.2] font-bold"
      >
        Ask us
      </h3>

      <p className="text-[13px] leading-[1.45] text-tm-text-2">{body}</p>

      {chatHref ? (
        <a
          href={chatHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Start a chat on WhatsApp (opens in a new tab)"
          className="mt-auto inline-flex self-start items-center gap-1.5 text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong"
        >
          Start a chat
          <ArrowRight weight="bold" className="size-3.5 shrink-0" aria-hidden />
        </a>
      ) : (
        <Link
          href={CONTACT_HREF}
          className="mt-auto inline-flex self-start items-center gap-1.5 text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong"
        >
          Send us a message
          <ArrowRight weight="bold" className="size-3.5 shrink-0" aria-hidden />
        </Link>
      )}
    </section>
  );
}
