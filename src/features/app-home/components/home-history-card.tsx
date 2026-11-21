import Link from "next/link";
import { ArrowRight, ChatCircleText, LinkSimple, Sparkle } from "@phosphor-icons/react/ssr";

import { chatItemsLine, chatWhen } from "@/features/finder/chat-format";
import { cn } from "@/lib/utils";

import type { HomeHistory, HomePasteItem } from "../types";

export interface HomeHistoryCardProps {
  history: HomeHistory;
  /** Passed in so every relative time on the render is read against one instant. */
  now: Date;
  className?: string;
}

const OUTCOME: Record<HomePasteItem["outcome"], { label: string; tone: "green" | "amber" | "muted" }> = {
  reading: { label: "Reading", tone: "muted" },
  priced: { label: "Priced", tone: "green" },
  unpriced: { label: "No price found", tone: "amber" },
  unavailable: { label: "Out of stock", tone: "amber" },
  expired: { label: "Quote lapsed", tone: "amber" },
};

/**
 * "Your history" (107): the chats with the shopping assistant and the links
 * pasted, newest first. It took the live receipt's place; each row opens the
 * conversation or the quote. Figures are the finder's own, never computed here.
 *
 * The section's `id` is stop two of the first-run tour.
 */
export function HomeHistoryCard({ history, now, className }: HomeHistoryCardProps) {
  const { chats, pastes } = history;
  const empty = chats.length === 0 && pastes.length === 0;
  return (
    <section
      id="onboarding-tour-history"
      aria-labelledby="home-history-heading"
      className={cn("tm-up flex min-w-0 flex-col gap-4 rounded-[24px] border border-tm-border bg-card p-[22px] [animation-delay:0.12s]", className)}
    >
      <header className="flex items-center justify-between gap-3">
        <h2 id="home-history-heading" className="font-display text-[17px] leading-none font-bold">
          Your history
        </h2>
        <Link href="/app/find" className="inline-flex items-center gap-1 text-[13px] font-semibold text-tm-coral hover:text-tm-coral-strong">
          New chat
          <ArrowRight weight="bold" className="size-3.5" aria-hidden />
        </Link>
      </header>

      {empty ? (
        <div className="flex flex-col gap-3 rounded-[18px] bg-tm-tint/60 p-4">
          <p className="text-[14px] leading-relaxed text-tm-text-2">
            Ask the shopping assistant for anything, or paste a product link. Every chat and every price is kept here,
            landed in Accra, so you can come back to it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/app/find" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-tm-ink px-4 text-[13px] font-semibold text-white">
              <Sparkle weight="fill" className="size-4" aria-hidden />
              Ask the assistant
            </Link>
            <Link href="/app/orders/new" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold">
              <LinkSimple weight="bold" className="size-4" aria-hidden />
              Paste a link
            </Link>
          </div>
        </div>
      ) : (
        <>
          {chats.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-[11.5px] font-bold tracking-[0.06em] text-tm-text-3 uppercase">Chats</h3>
              <ul className="-mx-2 flex flex-col">
                {chats.map((c) => {
                  const line = chatItemsLine(c.items);
                  return (
                    <li key={c.id}>
                      <Link href={`/app/find/chat/${c.id}`} className="flex items-start gap-2.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-tm-tint">
                        <ChatCircleText weight="duotone" className="mt-0.5 size-[18px] shrink-0 text-tm-coral" aria-hidden />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[14px] font-semibold">{c.title}</span>
                          {line && <span className="truncate text-[12.5px] text-tm-text-3">{line}</span>}
                        </span>
                        <span className="shrink-0 text-[12px] text-tm-text-3">{chatWhen(c.updatedAt, now.getTime())}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {pastes.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-[11.5px] font-bold tracking-[0.06em] text-tm-text-3 uppercase">Pasted links</h3>
              <ul className="-mx-2 flex flex-col">
                {pastes.map((p) => {
                  const o = OUTCOME[p.outcome];
                  return (
                    <li key={p.id}>
                      <Link href={p.href} className="flex items-start gap-2.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-tm-tint">
                        <LinkSimple weight="bold" className="mt-0.5 size-[17px] shrink-0 text-tm-text-3" aria-hidden />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[14px] font-semibold">{p.title}</span>
                          <span className="flex items-center gap-1.5 text-[12.5px] text-tm-text-3">
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-px text-[11px] font-semibold",
                                o.tone === "green" ? "bg-tm-green-bg text-tm-green-ink" : o.tone === "amber" ? "bg-tm-amber-bg text-tm-text-2" : "bg-muted text-tm-text-3",
                              )}
                            >
                              {o.label}
                            </span>
                            {p.storeHost && <span className="truncate">{p.storeHost}</span>}
                          </span>
                        </span>
                        <span className="shrink-0 text-[12px] text-tm-text-3">{chatWhen(p.pastedAt, now.getTime())}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
