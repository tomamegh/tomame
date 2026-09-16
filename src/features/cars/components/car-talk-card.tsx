import Link from "next/link";
import { ArrowRight, WhatsappLogo } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import { carWhatsappHref, carWhatsappMessage } from "./purchase";

/** Where a customer lands when no WhatsApp number is configured. */
const CONTACT_HREF = "/contact";

export interface CarTalkCardProps {
  /**
   * `whatsappHref(site_settings.whatsapp_number)` from
   * `@/components/layout/marketing/links`, resolved SERVER-SIDE by the page and
   * passed down. Null when no number is configured.
   */
  whatsappHref: string | null;
  /** `site_settings.support_hours`, when published. Null drops the clause. */
  supportHours: string | null;
  /** "2019 Toyota Highlander XLE" — goes into the message the customer sends. */
  title: string;
  /** The car's absolute URL, so whoever answers can open the vehicle. */
  carUrl: string;
  className?: string;
}

/**
 * "Talk to us about this car".
 *
 * WHY A CAR GETS ITS OWN HANDOFF WHEN THE REST OF THE APP HAS ONE ON HOME. A
 * customer about to move GH₵200,000 wants a person, and they want that person
 * while they are looking at the vehicle, not after navigating back to a card on
 * `/app`. The sums here are two orders of magnitude above a parcel, so this is
 * not a footnote on the page.
 *
 * WHATSAPP, NOT AN IN-APP CHAT. There is no messaging surface in this product
 * and building one to answer six car enquiries a month would be the wrong
 * thing; WhatsApp is where Ghanaian buyers already are and where our number
 * already answers.
 *
 * THE NUMBER IS RESOLVED ONCE, IN THE SERVER PAGE, AND REUSED. It comes from
 * `getMarketingSettings()` through `whatsappHref()` in
 * `@/components/layout/marketing/links` — the exact path `AskBuyerCard` takes.
 * A second implementation of "a Ghanaian writes 0XXXXXXXXX and WhatsApp wants
 * 233XXXXXXXXX" is a second thing to get wrong, and a client component fetching
 * `site_settings` for itself would be a third.
 *
 * IT ALWAYS RENDERS, AND NEVER PROMISES A CHANNEL THAT DOES NOT EXIST. That is
 * `AskBuyerCard`'s precedent and the reason for it holds harder here: an
 * affordance that vanishes per deployment is not an affordance, and a buyer
 * with a question about a six-figure vehicle still needs somewhere to go. With
 * no number configured the card rewords itself and points at `/contact`, a real
 * working destination, rather than linking to a dead `wa.me/`.
 *
 * SECOND, NOT FIRST. It is an outline card in the aside under the price and the
 * landed-cost breakdown, not a button in the action row: the primary action on
 * this page is still paying the deposit, and two coral calls to action side by
 * side means neither is the call to action.
 *
 * A Server Component.
 */
export function CarTalkCard({
  whatsappHref,
  supportHours,
  title,
  carUrl,
  className,
}: CarTalkCardProps) {
  const href = carWhatsappHref(whatsappHref, carWhatsappMessage(title, carUrl));
  const hours = supportHours?.trim() ? supportHours.trim() : null;

  const body = href
    ? `Spending this much is a conversation, not a form. Message us about this car and a real person answers on WhatsApp${
        hours ? `, ${hours}` : ""
      }.`
    : `Spending this much is a conversation, not a form. Send us your question about this car and a real person answers${
        hours ? `, ${hours}` : ""
      }.`;

  return (
    <section
      aria-labelledby="car-talk-heading"
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-[20px] border border-tm-border bg-card p-5",
        className,
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-tm-green-bg text-tm-green">
        <WhatsappLogo weight="duotone" className="size-[21px]" aria-hidden />
      </span>

      <h2
        id="car-talk-heading"
        className="mt-0.5 min-w-0 font-display text-[16px] leading-[1.2] font-bold"
      >
        Talk to us about this car
      </h2>

      <p className="min-w-0 text-[12.5px] leading-[1.45] font-medium text-tm-text-2">
        {body}
      </p>

      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Message us about the ${title} on WhatsApp (opens in a new tab)`}
          className={cn(
            "mt-1 flex h-11 min-w-0 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-tm-border bg-card px-4",
            "text-[14px] leading-none font-bold text-tm-ink transition-colors hover:border-tm-coral/40 hover:bg-tm-tint",
            "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
          )}
        >
          <WhatsappLogo weight="fill" className="size-4 shrink-0" aria-hidden />
          <span className="truncate">Message us on WhatsApp</span>
        </a>
      ) : (
        <Link
          href={CONTACT_HREF}
          className={cn(
            "mt-1 flex h-11 min-w-0 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-tm-border bg-card px-4",
            "text-[14px] leading-none font-bold text-tm-ink transition-colors hover:border-tm-coral/40 hover:bg-tm-tint",
            "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
          )}
        >
          <span className="truncate">Send us a message</span>
          <ArrowRight weight="bold" className="size-4 shrink-0" aria-hidden />
        </Link>
      )}
    </section>
  );
}
