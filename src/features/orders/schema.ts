import * as z from "zod";

// ── Order schemas ─────────────────────────────────────────────────────────────

/**
 * What the CLIENT may say about a new order. Everything about money — price
 * used for pricing, currency, weight, category, pricing breakdown, review
 * flags — comes from the server-side extraction snapshot referenced by
 * `extraction_cache_id`. The client's `estimated_price_usd` is used only when
 * the snapshot has no price (or there is no snapshot), and such orders are
 * always flagged for admin review.
 */
export const createOrderSchema = z.object({
  product_url: z.url("Must be a valid URL"),
  product_name: z
    .string({ error: "Product name is required" })
    .min(1, "Product name is required")
    .max(500, "Product name must be under 500 characters")
    .trim(),
  product_image_url: z.url("Must be a valid URL").optional(),
  /** Customer's estimate — only used when extraction found no price. */
  estimated_price_usd: z.coerce
    .number<number>()
    .positive("Price must be positive")
    .max(50_000, "Price exceeds maximum allowed")
    .optional(),
  quantity: z
    .int("Quantity must be a whole number")
    .positive("Quantity must be at least 1")
    .max(100, "Quantity exceeds maximum allowed")
    .default(1),
  /** Only used when the store region could not be determined. */
  origin_country: z.enum(["USA", "UK", "CHINA"], { error: "Origin country must be USA, UK, or CHINA" }).optional(),
  special_instructions: z
    .string()
    .max(2000, "Special instructions must be under 2000 characters")
    .trim()
    .optional(),
  extraction_cache_id: z.string().uuid().optional(),
});

export const reviewOrderSchema = z.object({
  action: z.enum(["approve", "reject", "set_price"]),
  updates: z
    .object({
      product_name: z.string().min(1).max(500).optional(),
      estimated_price_usd: z.number().positive().max(50_000).optional(),
      product_image_url: z.url().optional().nullable(),
      origin_country: z.enum(["USA", "UK", "CHINA"]).optional(),
    })
    .optional(),
  reason: z.string().max(1000).optional(),
  admin_total_ghs: z.number().positive().max(500_000).optional(),
  admin_pricing_note: z.string().max(1000).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["pending", "paid", "processing", "in_transit", "delivered", "completed", "cancelled"]),
  tracking_number: z.string().min(1).max(100).optional(),
  carrier: z.string().min(1).max(100).optional(),
  estimated_delivery_date: z.string().optional(),
  tracking_url: z.url("Must be a valid URL").optional(),
  notes: z.string().max(2000).optional(),
});

export type CreateOrderSchemaType = z.infer<typeof createOrderSchema>;
export type ReviewOrderSchemaType = z.infer<typeof reviewOrderSchema>;
export type UpdateOrderSchemaType = z.infer<typeof updateOrderStatusSchema>;
