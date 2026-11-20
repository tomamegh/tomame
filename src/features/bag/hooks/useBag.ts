"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useVisibleInterval } from "@/lib/use-visible-interval";
import type { ApiSuccessResponse } from "@/types/api";
import type { SetBagDeliveryInput, UpdateBagLineInput } from "../schema";
import type { BagLine, BagView, CheckoutResult } from "../types";
import { bagKeys, fetchBag } from "./useAddToBag";

/**
 * The bag, seeded from the server render and refetched after every mutation.
 *
 * While a line is still being read (049) the bag also polls, because the answer
 * arrives from a background job that has no way to push. Polling STOPS the moment
 * nothing is pending — an idle bag must not sit there hitting the server, and the
 * re-price on every read is not free.
 */
export function useBag(initialData: BagView) {
  const query = useQuery<BagView>({
    queryKey: bagKeys.all,
    queryFn: fetchBag,
    initialData,
    staleTime: 0,
  });

  // Driven from an effect, not `refetchInterval`'s callback form: that form was
  // measured not to re-arm when a bag with nothing pending gains its first
  // pending line — which is exactly what adding a still-reading link does, so
  // the line would never have priced itself without a reload.
  // A freight check is a wait too: it clears in seconds and the line prices itself.
  const pending = query.data.has_pending_lines || query.data.has_freight_checks;
  const { refetch } = query;
  useVisibleInterval(() => void refetch(), BAG_POLL_MS, pending);
  // A price re-read (103) finishes on its own within a minute; a staff check
  // takes longer, so the bag asks rarely while one is open and Pay unlocks
  // without a reload when it clears.
  const holds = query.data.lines.map((l) => l.pay_hold).filter((h) => h != null && h.kind !== "freight_check");
  const autoHold = holds.some((h) => h!.kind === "price_check" && !h!.needs_staff);
  useVisibleInterval(() => void refetch(), HOLD_AUTO_POLL_MS, autoHold && !pending);
  useVisibleInterval(() => void refetch(), HOLD_STAFF_POLL_MS, holds.length > 0 && !autoHold && !pending);

  return query;
}

/**
 * How often the bag asks again while something is pending.
 *
 * Every two seconds: a paste usually lands in five to twenty, so this is a
 * handful of requests per link rather than a live feed, and each one costs a
 * full re-price of the bag.
 */
export const BAG_POLL_MS = 2_000;
/** While an automatic price re-read runs: the same cadence as the quote screen. */
export const HOLD_AUTO_POLL_MS = 5_000;
/** While a line waits on a person (price or stock check): once a minute. */
export const HOLD_STAFF_POLL_MS = 60_000;

export function useUpdateBagLine() {
  const queryClient = useQueryClient();
  return useMutation<BagLine, Error, { id: string } & UpdateBagLineInput>({
    mutationFn: async ({ id, ...input }) => {
      const res = await apiFetch<ApiSuccessResponse<BagLine>>(`/api/cart/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return res.data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: bagKeys.all }),
  });
}

export function useRemoveBagLine() {
  const queryClient = useQueryClient();
  return useMutation<{ item_count: number }, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const res = await apiFetch<ApiSuccessResponse<{ item_count: number }>>(`/api/cart/items/${id}`, { method: "DELETE" });
      return res.data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: bagKeys.all }),
  });
}

/**
 * `PATCH /api/cart` — choose where the bag goes. The server re-prices the whole
 * bag around the zone fee, so the response replaces the cached view wholesale.
 */
export function useSetBagDelivery() {
  const queryClient = useQueryClient();
  return useMutation<BagView, Error, SetBagDeliveryInput>({
    mutationFn: async (input) => {
      const res = await apiFetch<ApiSuccessResponse<BagView>>("/api/cart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return res.data;
    },
    onSuccess: (view) => queryClient.setQueryData(bagKeys.all, view),
    onSettled: () => queryClient.invalidateQueries({ queryKey: bagKeys.all }),
  });
}

/**
 * `POST /api/cart/checkout` — turn the bag into one order group. The delivery
 * choice already lives on the cart, so the body is empty; nothing about money
 * crosses the wire.
 */
export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation<CheckoutResult, Error, { whatsapp_updates: boolean } | void>({
    mutationFn: async (input) => {
      const res = await apiFetch<ApiSuccessResponse<CheckoutResult>>("/api/cart/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input ?? {}),
      });
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bagKeys.all }),
  });
}
