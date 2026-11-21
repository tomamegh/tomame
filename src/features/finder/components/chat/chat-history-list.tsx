"use client";

import { ChatCircleText } from "@phosphor-icons/react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { chatItemsLine, chatWhen } from "../../chat-format";
import type { FinderChatSummary } from "../../types";

/** The viewer's chats, newest first. Each opens its conversation. */
export function ChatHistoryList({ chats, activeId, onPick }: { chats: FinderChatSummary[]; activeId: string | null; onPick?: () => void }) {
  if (chats.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-tm-border px-4 py-5 text-[13px] leading-relaxed text-muted-foreground">
        Your chats and searches will be kept here.
      </p>
    );
  }
  return (
    <nav aria-label="Your chats" className="min-h-0 overflow-y-auto rounded-2xl border border-tm-border bg-card p-1.5">
      <ul className="flex flex-col gap-0.5">
        {chats.map((c) => {
          const line = chatItemsLine(c.items);
          return (
            <li key={c.id}>
              <Link
                href={`/app/find/chat/${c.id}`}
                onClick={onPick}
                aria-current={c.id === activeId ? "page" : undefined}
                className={cn(
                  "flex gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted",
                  c.id === activeId && "bg-tm-tint hover:bg-tm-tint",
                )}
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
    </nav>
  );
}
