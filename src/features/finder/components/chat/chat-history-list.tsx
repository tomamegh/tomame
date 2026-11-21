"use client";

import { ChatCircleText, LinkSimple } from "@phosphor-icons/react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { chatItemsLine, chatWhen } from "../../chat-format";
import type { FinderChatSummary, PastedLinkSummary } from "../../types";

const OUTCOME: Record<PastedLinkSummary["outcome"], { label: string; tone: "green" | "amber" | "muted" }> = {
  reading: { label: "Reading", tone: "muted" },
  priced: { label: "Priced", tone: "green" },
  unpriced: { label: "No price found", tone: "amber" },
  unavailable: { label: "Out of stock", tone: "amber" },
  expired: { label: "Quote lapsed", tone: "amber" },
};

/**
 * Everything the viewer asked us for (107), newest first: their chats, then
 * the links they pasted. Each row opens its conversation or its quote.
 */
export function ChatHistoryList({
  chats,
  pastes = [],
  activeId,
  onPick,
}: {
  chats: FinderChatSummary[];
  pastes?: PastedLinkSummary[];
  activeId: string | null;
  onPick?: () => void;
}) {
  if (chats.length === 0 && pastes.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-tm-border px-4 py-5 text-[13px] leading-relaxed text-muted-foreground">
        Your chats and the links you paste will be kept here.
      </p>
    );
  }
  return (
    <nav aria-label="Your chats and links" className="min-h-0 overflow-y-auto rounded-2xl border border-tm-border bg-card p-1.5">
      {chats.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {chats.map((c) => {
            const line = chatItemsLine(c.items);
            return (
              <li key={c.id}>
                <Link
                  href={`/app/find/chat/${c.id}`}
                  onClick={onPick}
                  aria-current={c.id === activeId ? "page" : undefined}
                  className={cn("flex gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted", c.id === activeId && "bg-tm-tint hover:bg-tm-tint")}
                >
                  <ChatCircleText size={17} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[13.5px] font-semibold">{c.title}</span>
                    {line && <span className="truncate text-[12px] text-muted-foreground">{line}</span>}
                    <span className="text-[11.5px] text-muted-foreground/80" suppressHydrationWarning>
                      {chatWhen(c.updatedAt)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {pastes.length > 0 && (
        <>
          <h3 className={cn("px-3 pb-1 text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase", chats.length > 0 ? "mt-2 border-t border-tm-border pt-3" : "pt-2")}>
            Pasted links
          </h3>
          <ul className="flex flex-col gap-0.5">
            {pastes.map((p) => {
              const o = OUTCOME[p.outcome];
              return (
                <li key={p.id}>
                  <Link href={p.href} onClick={onPick} className="flex gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted">
                    <LinkSimple size={16} weight="bold" className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[13.5px] font-semibold">{p.title}</span>
                      <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-px text-[11px] font-semibold",
                            o.tone === "green" ? "bg-tm-green-bg text-tm-green-ink" : o.tone === "amber" ? "bg-tm-amber-bg text-tm-text-2" : "bg-muted",
                          )}
                        >
                          {o.label}
                        </span>
                        {p.storeHost && <span className="truncate">{p.storeHost}</span>}
                      </span>
                      <span className="text-[11.5px] text-muted-foreground/80" suppressHydrationWarning>
                        {chatWhen(p.pastedAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </nav>
  );
}
