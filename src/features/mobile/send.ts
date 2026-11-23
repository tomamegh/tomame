"use client";

import { apiFetch } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/api";

/**
 * Send words or links to Buy for me and say which screen shows the answer. Same call and the
 * same rule as the website's `?url=` hand-off (`app/orders/new/extract-and-forward.tsx`): one
 * link priced on the spot opens its product screen; anything else opens the chat.
 */
export async function sendToBuyForMe(text: string, chatId: string | null = null): Promise<string> {
  const res = await apiFetch<ApiSuccessResponse<{ chatId: string; readyQuotes: { extractionCacheId: string }[] }>>(
    "/api/finder/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
  );
  const { chatId: id, readyQuotes } = res.data;
  const links = text.match(/https?:\/\/\S+/gi) ?? [];
  const words = text.replace(/https?:\/\/\S+/gi, "").trim();
  if (links.length === 1 && !words && readyQuotes.length === 1) return `/m/product/${readyQuotes[0]!.extractionCacheId}`;
  return `/m/chat/${id}`;
}
