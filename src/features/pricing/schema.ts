import { z } from "zod";

// ── Pricing Group Schemas ───────────────────────────────────────────────────

export const createPricingGroupSchema = z
  .object({
    slug: z
      .string()
      .min(2, "Slug must be at least 2 characters")
      .max(50, "Slug must be at most 50 characters")
      .regex(/^[a-z][a-z0-9_]*$/, "Slug must be lowercase with underscores only"),
    name: z.string().min(1, "Name is required").max(100),
    flat_rate_ghs: z.number().nonnegative().nullable().optional(),
    flat_rate_expression: z.string().max(100).nullable().optional(),
    value_percentage: z.number().min(0).max(1, "Must be between 0 and 1"),
    value_percentage_high: z.number().min(0).max(1).nullable().optional(),
    value_threshold_usd: z.number().positive().nullable().optional(),
    default_weight_lbs: z.number().positive().nullable().optional(),
    requires_weight: z.boolean().default(false),
    sort_order: z.number().int().nonnegative().default(0),
  })
  .refine(
    (data) => {
      const hasFlat = data.flat_rate_ghs != null;
      const hasExpr = data.flat_rate_expression != null && data.flat_rate_expression !== "";
      return (hasFlat && !hasExpr) || (!hasFlat && hasExpr);
    },
    { message: "Exactly one of flat_rate_ghs or flat_rate_expression must be provided" },
  )
  .refine(
    (data) => {
      const hasThreshold = data.value_threshold_usd != null;
      const hasHigh = data.value_percentage_high != null;
      return (hasThreshold && hasHigh) || (!hasThreshold && !hasHigh);
    },
    { message: "value_threshold_usd and value_percentage_high must both be set or both be null" },
  );

export const updatePricingGroupSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    flat_rate_ghs: z.number().nonnegative().nullable().optional(),
    flat_rate_expression: z.string().max(100).nullable().optional(),
    value_percentage: z.number().min(0).max(1).optional(),
    value_percentage_high: z.number().min(0).max(1).nullable().optional(),
    value_threshold_usd: z.number().positive().nullable().optional(),
    default_weight_lbs: z.number().positive().nullable().optional(),
    requires_weight: z.boolean().optional(),
    sort_order: z.number().int().nonnegative().optional(),
    is_active: z.boolean().optional(),
  });

// ── Category Mapping Schemas ────────────────────────────────────────────────

export const updateCategoryMappingSchema = z.object({
  pricing_group_id: z.string().uuid("Invalid pricing group ID"),
});

export const bulkCategoryMappingSchema = z.object({
  mappings: z.array(
    z.object({
      tomame_category: z.string().min(1),
      pricing_group_id: z.string().uuid("Invalid pricing group ID"),
    }),
  ).min(1, "At least one mapping is required"),
});

export type CreatePricingGroupInput = z.infer<typeof createPricingGroupSchema>;
export type UpdatePricingGroupInput = z.infer<typeof updatePricingGroupSchema>;
export type UpdateCategoryMappingInput = z.infer<typeof updateCategoryMappingSchema>;
export type BulkCategoryMappingInput = z.infer<typeof bulkCategoryMappingSchema>;
