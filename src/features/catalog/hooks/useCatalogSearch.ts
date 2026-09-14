"use client";

import { useQuery } from "@tanstack/react-query";

import { CATALOG_SEARCH } from "@/config/catalog";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { CatalogSearchPayload } from "../types";

export const catalogKeys = {
  all: ["catalog"] as const,
  search: (query: string, limit: number) =>
    [...catalogKeys.all, "search", query, limit] as const,
};

/**
 * The pre-priced catalogue, searched from the browser.
 *
 * Only the similar-products rail needs this: `/app/products` is a server
 * component that calls the service directly, because a search that lives in the
 * URL has no client state to hold. The rail cannot do that, since the quote it
 * hangs off is itself fetched client-side.
 *
 * Disabled until the term is long enough for the endpoint to accept, so a short
 * or null term costs no request and produces no 400. Landed totals move only
 * with the daily scrape and the FX buffer, so a five-minute `staleTime` keeps a
 * customer stepping through quantities from re-searching on every render.
 */
export function useCatalogSearch(
  query: string | null,
  options: { limit?: number } = {},
) {
  const limit = Math.min(
    options.limit ?? CATALOG_SEARCH.defaultLimit,
    CATALOG_SEARCH.maxLimit,
  );
  const term = query?.trim() ?? "";
  const enabled = term.length >= CATALOG_SEARCH.minQueryLength;

  return useQuery<
    ApiSuccessResponse<CatalogSearchPayload>,
    Error,
    CatalogSearchPayload
  >({
    queryKey: catalogKeys.search(term, limit),
    queryFn: () =>
      apiFetch<ApiSuccessResponse<CatalogSearchPayload>>(
        `/api/catalog/search?q=${encodeURIComponent(term)}&limit=${limit}`,
      ),
    select: (response) => response.data,
    enabled,
    staleTime: 5 * 60_000,
    // A rail of alternatives is a courtesy, not the screen's job. One try, no
    // retry storm behind a quote the customer is already reading.
    retry: false,
  });
}
