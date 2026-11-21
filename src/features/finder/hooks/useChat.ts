"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { apiFetch } from "@/lib/api-client";
import { useVisibleInterval } from "@/lib/use-visible-interval";
import type { ApiSuccessResponse } from "@/types/api";

import type { FinderChatMessageView, FinderChatSummary, FinderChatView } from "../types";
import { FINDER_POLL_MS } from "./useFinder";

export const chatKeys = {
  chat: (id: string) => ["finder-chat", id] as const,
  history: ["finder-chat-history"] as const,
};

const working = (v: FinderChatView | undefined) =>
  v != null && Object.values(v.runs).some((r) => r.status === "pending" || r.status === "running");

/**
 * One chat, polled every two seconds while any of its searches works. The
 * poll is `?lite=1`; the email and buyer number keep the first read's values.
 */
export function useChatView(initial: FinderChatView | null, chatId: string | null) {
  const query = useQuery<FinderChatView>({
    queryKey: chatKeys.chat(chatId ?? "new"),
    queryFn: async () => {
      const res = await apiFetch<ApiSuccessResponse<FinderChatView>>(`/api/finder/chat/${chatId}?lite=1`);
      return res.data;
    },
    enabled: chatId != null,
    initialData: initial ?? undefined,
    staleTime: 0,
  });
  const { refetch } = query;
  useVisibleInterval(() => void refetch(), FINDER_POLL_MS, chatId != null && working(query.data));
  const data = query.data;
  return data
    ? { ...data, email: data.email ?? initial?.email ?? null, buyerWhatsappNumber: data.buyerWhatsappNumber ?? initial?.buyerWhatsappNumber ?? null, refetch }
    : null;
}

/** One message to the assistant. Resolves with the chat id (new or the same) and the two saved messages. */
export function useSendChat() {
  const queryClient = useQueryClient();
  const mutation = useMutation<{ chatId: string; messages: FinderChatMessageView[] }, Error, { chatId: string | null; text: string; email?: string | null }>({
    mutationFn: async ({ chatId, text, email }) => {
      const res = await apiFetch<ApiSuccessResponse<{ chatId: string; messages: FinderChatMessageView[] }>>("/api/finder/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, email: email ?? null }),
      });
      return res.data;
    },
    onSuccess: ({ chatId }) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.chat(chatId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.history });
    },
  });
  return mutation;
}

export function useChatHistory(initial: FinderChatSummary[]) {
  return useQuery<FinderChatSummary[]>({
    queryKey: chatKeys.history,
    queryFn: async () => (await apiFetch<ApiSuccessResponse<{ chats: FinderChatSummary[] }>>("/api/finder/chat")).data.chats,
    initialData: initial,
    staleTime: 10_000,
  });
}

/** A visitor's address for this chat's results. */
export function useChatEmail(chatId: string | null) {
  const queryClient = useQueryClient();
  const mutation = useMutation<{ email: string }, Error, string>({
    mutationFn: async (email) => {
      const res = await apiFetch<ApiSuccessResponse<{ email: string }>>(`/api/finder/chat/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      return res.data;
    },
    onSuccess: () => {
      if (chatId) void queryClient.invalidateQueries({ queryKey: chatKeys.chat(chatId) });
    },
  });
  return useCallback((email: string) => mutation.mutateAsync(email), [mutation]);
}
