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

// ── Fixed Freight Item Schemas ──────────────────────────────────────────────

/** Well above any real negotiated rate (the dearest seeded row is a few thousand). */
export const FIXED_FREIGHT_RATE_MAX_GHS = 100_000;

const fixedFreightCategory = z
  .string()
  .trim()
  .min(1, "Shelf is required")
  .max(60, "Shelf must be at most 60 characters")
  .transform((s) => s.replace(/\s+/g, " ").toUpperCase());

const fixedFreightName = z
  .string()
  .trim()
  .min(1, "Product name is required")
  .max(120, "Product name must be at most 120 characters");

const fixedFreightRate = z
  .number({ error: "Rate must be a number" })
  .finite()
  .positive("Rate must be greater than zero")
  .max(FIXED_FREIGHT_RATE_MAX_GHS, `Rate must be at most ${FIXED_FREIGHT_RATE_MAX_GHS} GHS`);

/** Trimmed, lower-cased, inner whitespace collapsed, blanks dropped, de-duplicated. */
const fixedFreightKeywords = z
  .array(z.string().max(80, "A keyword must be at most 80 characters"))
  .max(50, "At most 50 keywords")
  .transform((list) => [...new Set(list.map((k) => k.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))])
  .refine((list) => list.length > 0, { message: "At least one keyword is required" });

const fixedFreightSortOrder = z.number().int("Sort order must be a whole number").min(0).max(100_000);

export const createFixedFreightItemSchema = z.object({
  category: fixedFreightCategory,
  product_name: fixedFreightName,
  freight_rate_ghs: fixedFreightRate,
  keywords: fixedFreightKeywords,
  sort_order: fixedFreightSortOrder.default(0),
  is_active: z.boolean().default(true),
});

export const updateFixedFreightItemSchema = z
  .object({
    category: fixedFreightCategory.optional(),
    product_name: fixedFreightName.optional(),
    freight_rate_ghs: fixedFreightRate.optional(),
    keywords: fixedFreightKeywords.optional(),
    sort_order: fixedFreightSortOrder.optional(),
    is_active: z.boolean().optional(),
    /** The row's `updated_at` as the admin loaded it; a mismatch is a 409. */
    expected_updated_at: z.string().min(1).max(64).optional(),
  })
  .strict()
  .refine(
    ({ expected_updated_at: _stamp, ...data }) => Object.values(data).some((v) => v !== undefined),
    { message: "Nothing to update" },
  );

export const testFixedFreightTitleSchema = z.object({
  title: z.string().trim().min(1, "Enter a product title").max(500),
  category: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((c) => (c ? c : null)),
});

export type CreatePricingGroupInput = z.infer<typeof createPricingGroupSchema>;
export type UpdatePricingGroupInput = z.infer<typeof updatePricingGroupSchema>;
export type UpdateCategoryMappingInput = z.infer<typeof updateCategoryMappingSchema>;
export type BulkCategoryMappingInput = z.infer<typeof bulkCategoryMappingSchema>;
export type CreateFixedFreightItemInput = z.infer<typeof createFixedFreightItemSchema>;
export type UpdateFixedFreightItemInput = z.infer<typeof updateFixedFreightItemSchema>;
export type TestFixedFreightTitleInput = z.infer<typeof testFixedFreightTitleSchema>;
