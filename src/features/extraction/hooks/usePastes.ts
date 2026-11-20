"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { bagKeys, trackAddToBag } from "@/features/bag/hooks/useAddToBag";
import type { AddToBagResult } from "@/features/bag/types";
import { apiFetch } from "@/lib/api-client";
import { useVisibleBackoff, type BackoffOptions } from "@/lib/use-visible-interval";
import type { ApiSuccessResponse } from "@/types/api";
import type { PasteBatchPreview } from "../services/paste-batch";
import type { PasteStatus } from "../services/paste-status";

export const pasteKeys = { all: ["pastes"] as const };

/**
 * How often the screen asks again while a link is still being read.
 *
 * Starts at two seconds, matching the bag: a paste usually lands in five to
 * twenty. Each tick then waits 1.5x longer, up to ten seconds, so a slow job
 * is a few requests a minute rather than thirty. Polling stops the moment
 * nothing is reading — an idle screen must not sit there asking.
 */
export const PASTE_POLL: BackoffOptions = { minMs: 2_000, maxMs: 10_000, factor: 1.5 };

export function usePastes(initialData: PasteStatus[]) {
  const query = useQuery<PasteStatus[]>({
    queryKey: pasteKeys.all,
    queryFn: async () => {
      const res = await apiFetch<ApiSuccessResponse<PasteStatus[]>>("/api/pastes");
      return res.data;
    },
    initialData,
    staleTime: 0,
  });

  // Poll while anything is still being read, and stop the moment nothing is.
  //
  // Driven from an effect rather than `refetchInterval`'s callback form. That
  // form was measured NOT to re-arm on the transition that actually matters —
  // a list with nothing reading gaining its first reading row, which is exactly
  // what pasting a link does. The screen made one request and then sat there:
  // the job finished within seconds and the page still said "Reading this
  // page…" a minute later, until the customer reloaded.
  // A re-check (106) is reading too: its old figures are replaced when it lands.
  const anyReading = query.data.some((p) => p.outcome === "reading" || p.rechecking);
  const { refetch } = query;
  useVisibleBackoff(() => void refetch(), PASTE_POLL, anyReading);

  return query;
}

/**
 * The priced links of a batch, priced together on the server (plan 2b). Keyed
 * by the set of priced paste ids, so it is asked once each time a link in the
 * batch lands rather than on every poll.
 */
const PREVIEW_SETTLE_MS = 4_000;
const PREVIEW_SETTLE_ATTEMPTS = 30;

export function usePasteBatchPreview(pricedPasteIds: readonly string[]) {
  const ids = [...pricedPasteIds].sort();
  return useQuery<PasteBatchPreview>({
    queryKey: [...pasteKeys.all, "preview", ids.join(",")],
    queryFn: async () => {
      const res = await apiFetch<ApiSuccessResponse<PasteBatchPreview>>("/api/pastes/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      return res.data;
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
    retry: 1,
    // A link can finish reading a moment before its price settles (category,
    // freight). Ask again while any priced link has no total yet, for about two
    // minutes, so a row never sticks on a price that has since landed.
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data || q.state.dataUpdateCount >= PREVIEW_SETTLE_ATTEMPTS) return false;
      const settling = data.lines.length < ids.length || data.lines.some((l) => l.total_ghs == null);
      return settling ? PREVIEW_SETTLE_MS : false;
    },
  });
}

/** Queue a link. Returns as soon as the row exists; the reading happens behind it. */
export function useCreatePaste() {
  const queryClient = useQueryClient();
  return useMutation<PasteStatus, Error, { product_url: string }>({
    mutationFn: async (body) => {
      const res = await apiFetch<ApiSuccessResponse<PasteStatus>>("/api/pastes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: pasteKeys.all }),
  });
}

/** Put a still-reading link in the bag, where it prices itself when the job lands. */
export function useAddPasteToBag() {
  const queryClient = useQueryClient();
  return useMutation<AddToBagResult, Error, { extraction_request_id: string; quantity: number }>({
    mutationFn: async (body) => {
      const res = await apiFetch<ApiSuccessResponse<AddToBagResult>>("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: (result, body) => trackAddToBag(result, body.quantity),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: bagKeys.all });
      queryClient.invalidateQueries({ queryKey: pasteKeys.all });
    },
  });
}
