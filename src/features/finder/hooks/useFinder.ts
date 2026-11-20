"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { apiFetch } from "@/lib/api-client";
import { useVisibleInterval } from "@/lib/use-visible-interval";
import type { ApiSuccessResponse } from "@/types/api";

import type { FinderRunView } from "../types";

export const finderKeys = { run: (id: string) => ["finder", id] as const };

/** The run screen asks again every two seconds while the job works, and stops when it settles. */
export const FINDER_POLL_MS = 2_000;

const isWorking = (v: Pick<FinderRunView, "status">) => v.status === "pending" || v.status === "running";

/**
 * One run, polled while it works. The poll is `?lite=1`, which leaves the
 * email and buyer number out; the screen keeps the ones it already holds.
 */
export function useFinderRun(initial: FinderRunView) {
  const query = useQuery<FinderRunView & { fetchedAt: number }>({
    queryKey: finderKeys.run(initial.id),
    queryFn: async ({ queryKey }) => {
      const res = await apiFetch<ApiSuccessResponse<FinderRunView>>(`/api/finder/${queryKey[1]}?lite=1`);
      return { ...res.data, fetchedAt: Date.now() };
    },
    initialData: { ...initial, fetchedAt: Date.now() },
    staleTime: 0,
  });

  const { refetch } = query;
  useVisibleInterval(() => void refetch(), FINDER_POLL_MS, isWorking(query.data));

  const data = query.data;
  return {
    ...data,
    email: data.email ?? initial.email,
    buyerWhatsappNumber: data.buyerWhatsappNumber ?? initial.buyerWhatsappNumber,
  };
}

/** Where the result goes: a visitor's address, the WhatsApp switch. */
export function useUpdateFinderContact(id: string) {
  const queryClient = useQueryClient();
  return useMutation<FinderRunView, Error, { email?: string | null; notify_whatsapp?: boolean }>({
    mutationFn: async (body) => {
      const res = await apiFetch<ApiSuccessResponse<FinderRunView>>(`/api/finder/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: (view) => queryClient.setQueryData(finderKeys.run(id), { ...view, fetchedAt: Date.now() }),
  });
}

/** Record the WhatsApp hand-off. Fire and forget: the link opens whatever happens here. */
export function recordFinderHandoff(id: string): void {
  void fetch(`/api/finder/${id}/handoff`, { method: "POST", keepalive: true, credentials: "same-origin" }).catch(() => undefined);
}

/**
 * "Find it for me": start a run and open its page. Shared by the Buy-for-me
 * box, both Home heroes and the run screen's "search for something else".
 */
export function useStartFinder() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation<{ id: string; reused: boolean }, Error, { query: string; budget_ghs?: number | null }>({
    mutationFn: async (body) => {
      const res = await apiFetch<ApiSuccessResponse<{ id: string; reused: boolean }>>("/api/finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.data;
    },
  });

  const start = useCallback(
    (query: string, budgetGhs: number | null = null) => {
      setError(null);
      mutation.mutate(
        { query, budget_ghs: budgetGhs },
        {
          onSuccess: ({ id }) => router.push(`/app/find/${id}`),
          onError: (e) => setError(e.message || "We could not start that search. Try again."),
        },
      );
    },
    [mutation, router],
  );

  return { start, pending: mutation.isPending || mutation.isSuccess, error, clearError: () => setError(null) };
}
