"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";

// ── Types ───────────────────────────────────────────────────────────────────

export interface PricingGroup {
  id: string;
  slug: string;
  name: string;
  flat_rate_ghs: number | null;
  flat_rate_expression: string | null;
  value_percentage: number;
  value_percentage_high: number | null;
  value_threshold_usd: number | null;
  default_weight_lbs: number | null;
  requires_weight: boolean;
  is_active: boolean;
  sort_order: number;
  category_count: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryMapping {
  id: string;
  tomame_category: string;
  pricing_group_id: string;
  updated_at: string;
  pricing_groups: {
    id: string;
    slug: string;
    name: string;
  };
}

// ── Query Keys ──────────────────────────────────────────────────────────────

export const pricingGroupKeys = {
  all: ["admin", "pricing-groups"] as const,
  detail: (id: string) => ["admin", "pricing-groups", id] as const,
  categoryMappings: ["admin", "category-mappings"] as const,
};

// ── Queries ─────────────────────────────────────────────────────────────────

export function usePricingGroups() {
  return useQuery<
    ApiSuccessResponse<{ groups: PricingGroup[] }>,
    Error,
    PricingGroup[]
  >({
    queryKey: pricingGroupKeys.all,
    queryFn: () =>
      apiFetch<ApiSuccessResponse<{ groups: PricingGroup[] }>>(
        "/api/admin/pricing-groups",
      ),
    select: (res) => res.data.groups,
    staleTime: 60_000,
  });
}

export function useCategoryMappings() {
  return useQuery<
    ApiSuccessResponse<{ mappings: CategoryMapping[] }>,
    Error,
    CategoryMapping[]
  >({
    queryKey: pricingGroupKeys.categoryMappings,
    queryFn: () =>
      apiFetch<ApiSuccessResponse<{ mappings: CategoryMapping[] }>>(
        "/api/admin/category-mappings",
      ),
    select: (res) => res.data.mappings,
    staleTime: 60_000,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useCreatePricingGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<PricingGroup, "id" | "category_count" | "created_at" | "updated_at" | "is_active">) =>
      apiFetch<ApiSuccessResponse<PricingGroup>>("/api/admin/pricing-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pricingGroupKeys.all });
    },
  });
}

export function useUpdatePricingGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiFetch<ApiSuccessResponse<PricingGroup>>(
        `/api/admin/pricing-groups/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pricingGroupKeys.all });
    },
  });
}

export function useDeletePricingGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<ApiSuccessResponse<{ message: string }>>(
        `/api/admin/pricing-groups/${id}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pricingGroupKeys.all });
    },
  });
}

export function useUpdateCategoryMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      category,
      pricing_group_id,
    }: {
      category: string;
      pricing_group_id: string;
    }) =>
      apiFetch(
        `/api/admin/category-mappings/${encodeURIComponent(category)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pricing_group_id }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pricingGroupKeys.categoryMappings,
      });
      queryClient.invalidateQueries({ queryKey: pricingGroupKeys.all });
    },
  });
}

export function useRemoveCategoryMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (category: string) =>
      apiFetch(
        `/api/admin/category-mappings/${encodeURIComponent(category)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pricingGroupKeys.categoryMappings,
      });
      queryClient.invalidateQueries({ queryKey: pricingGroupKeys.all });
    },
  });
}
