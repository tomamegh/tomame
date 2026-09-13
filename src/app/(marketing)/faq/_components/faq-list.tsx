import { Minus, Plus } from "@phosphor-icons/react/ssr";

import type { SiteContentRow } from "@/db/queries/site-content";
import { cn } from "@/lib/utils";

export interface FaqListProps {
  /** `faq` rows: `title` is the question, `body` the answer. */
  faqs: readonly SiteContentRow[];
}

/** The mock's per-row entry delays, capped so a long list does not crawl in. */
const ROW_DELAYS = ["0.06s", "0.12s", "0.18s", "0.24s", "0.3s", "0.36s"] as const;

/**
 * The questions, as `<details>`/`<summary>` — the same construction the landing
 * page's FAQ rail uses, and for the same reasons: keyboard-operable, announced
 * correctly, and no JavaScript at all. The page this replaced shipped a client
 * accordion with framer-motion to do less.
 *
 * Nothing is hardcoded. An empty list renders an honest line rather than a
 * skeleton of invented questions.
 */
export function FaqList({ faqs }: FaqListProps) {
  if (faqs.length === 0) {
    return (
      <p className="rounded-[24px] border border-tm-border bg-card px-6 py-10 text-center text-sm leading-[1.5] text-tm-text-2">
        No questions published yet. Ask us anything on WhatsApp in the meantime.
      </p>
    );
  }

  return (
    <ul className="flex max-w-[820px] flex-col gap-2.5">
      {faqs.map((faq, index) => (
        <li
          key={faq.id}
          className="tm-up [animation-duration:0.5s]"
          style={{ animationDelay: ROW_DELAYS[index] ?? "0.36s" }}
        >
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
              <Plus className="size-4.5 shrink-0 text-tm-text-3 group-open:hidden" aria-hidden />
              <Minus className="hidden size-4.5 shrink-0 text-tm-text-3 group-open:block" aria-hidden />
            </summary>
            <p className="mt-2.5 text-[15px] leading-[1.55] text-tm-text-2">{faq.body}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}
