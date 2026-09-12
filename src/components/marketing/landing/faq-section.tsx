import { Minus, Plus, WhatsappLogo } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import type { SiteContentRow } from "@/db/queries/site-content";

export interface FaqSectionProps {
  /** `faq` rows: `title` is the question, `body` the answer. */
  faqs: readonly SiteContentRow[];
  /** `https://wa.me/…`, or null when no number is configured. */
  whatsappHref: string | null;
  /** "8am–10pm", from `site_settings`. */
  supportHours: string | null;
}

/**
 * The FAQ rail.
 *
 * Built on `<details>`/`<summary>` rather than a client accordion: it is
 * keyboard-operable, announced correctly, open-by-default on the first row as
 * the design shows, and costs no JavaScript.
 */
export function FaqSection({
  faqs,
  whatsappHref,
  supportHours,
}: FaqSectionProps) {
  if (faqs.length === 0) return null;

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="scroll-mt-20 bg-card px-5 py-20 md:px-8 md:py-24"
    >
      <div className="mx-auto grid max-w-[1280px] items-start gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-15">
        <div className="flex flex-col gap-4 lg:sticky lg:top-24">
          <span className="text-[11px] font-semibold tracking-[0.14em] text-tm-coral uppercase">
            FAQ
          </span>
          <h2
            id="faq-heading"
            className="text-[clamp(1.875rem,5vw,44px)] leading-[1.02] font-bold"
          >
            Things people ask before their first order.
          </h2>
          <p className="text-base leading-[1.5] text-tm-text-2">
            Still unsure? WhatsApp us — a human answers within the hour
            {supportHours ? `, ${supportHours}` : ""}.
          </p>
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex h-11.5 w-fit items-center gap-2 rounded-xl border-[1.5px] border-tm-border bg-card px-4.5 text-sm font-semibold",
                "transition-colors hover:border-tm-coral/40 hover:bg-tm-tint",
                "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/30",
              )}
            >
              <WhatsappLogo
                weight="fill"
                className="size-4.5 text-tm-green"
                aria-hidden
              />
              Chat on WhatsApp
            </a>
          )}
        </div>

        <ul className="flex flex-col gap-2.5">
          {faqs.map((faq) => (
            <li key={faq.id}>
              <details
                open={faq.data.open === true}
                className="group rounded-[18px] border border-tm-border bg-card p-5 transition-colors open:bg-tm-paper hover:border-tm-coral/30"
              >
                <summary
                  className={cn(
                    "flex cursor-pointer list-none items-center justify-between gap-4 text-base leading-[1.3] font-semibold",
                    "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/30",
                    "[&::-webkit-details-marker]:hidden",
                  )}
                >
                  {faq.title}
                  <Plus
                    className="size-4.5 shrink-0 text-tm-text-3 group-open:hidden"
                    aria-hidden
                  />
                  <Minus
                    className="hidden size-4.5 shrink-0 text-tm-text-3 group-open:block"
                    aria-hidden
                  />
                </summary>
                <p className="mt-2.5 text-[15px] leading-[1.55] text-tm-text-2">
                  {faq.body}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
