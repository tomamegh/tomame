import * as z from "zod";

// ── Extraction metadata schema ────────────────────────────────────────────────

const scrapedProductSchema = z.object({
  title: z.string().nullable(),
  image: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
  description: z.string().nullable(),
  brand: z.string().nullable(),
  category: z.string().nullable().optional(),
  size: z.string().nullable(),
  weight: z.string().nullable(),
  dimensions: z.string().nullable(),
  specifications: z.record(z.string(), z.string()),
  metadata: z.record(z.string(), z.unknown()),
});

const extractionMetadataSchema = z.object({
  extraction_attempted: z.boolean(),
  extraction_success: z.boolean(),
  platform: z.string().nullable(),
  country: z.enum(["USA", "UK", "CHINA"]).nullable(),
  product: scrapedProductSchema,
  errors: z.array(z.string()),
  fetched_at: z.string(),
});

// ── Order schemas ─────────────────────────────────────────────────────────────

export const createOrderSchema = z.object({
  product_url: z.url("Must be a valid URL"),
  product_name: z
    .string({ error: "Product name is required" })
    .min(1, "Product name is required")
    .max(500, "Product name must be under 500 characters")
    .trim(),
  product_image_url: z.url("Must be a valid URL").optional(),
  estimated_price_usd: z.coerce
    .number<number>({ error: "Estimated price is required" })
    .positive("Price must be positive")
    .max(50_000, "Price exceeds maximum allowed"),
  quantity: z
    .int("Quantity must be a whole number")
    .positive("Quantity must be at least 1")
    .max(100, "Quantity exceeds maximum allowed")
    .default(1),
  origin_country: z.enum(["USA", "UK", "CHINA"], {
    error: "Origin country must be USA, UK, or CHINA",
  }),
  special_instructions: z
    .string()
    .max(2000, "Special instructions must be under 2000 characters")
    .trim()
    .optional(),
  needs_review: z.boolean().optional(),
  review_reasons: z.array(z.string()).optional(),
  extraction_metadata: extractionMetadataSchema.optional(),
  extraction_data: z.record(z.string(), z.unknown()).optional(),
  extraction_cache_id: z.string().uuid().optional(),
  pricing: z.record(z.string(), z.unknown()).optional(),
});

export const reviewOrderSchema = z.object({
  action: z.enum(["approve", "reject"]),
  updates: z
    .object({
      product_name: z.string().min(1).max(500).optional(),
      estimated_price_usd: z.number().positive().max(50_000).optional(),
      product_image_url: z.url().optional().nullable(),
      origin_country: z.enum(["USA", "UK", "CHINA"]).optional(),
    })
    .optional(),
  reason: z.string().max(1000).optional(),
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
