import * as z from "zod";

// ── Extraction metadata schema ────────────────────────────────────────────────

const extractionFieldSchema = z.object({
  value: z.union([z.string(), z.number(), z.null()]),
  source: z
    .enum(["json_ld", "og_meta", "meta_tag", "dom_selector", "domain_mapping"])
    .nullable(),
  confidence: z.enum(["high", "medium", "low"]).nullable(),
});

const extractionMetadataSchema = z.object({
  extractionAttempted: z.boolean(),
  extractionSuccess: z.boolean(),
  usedPuppeteer: z.boolean(),
  fields: z.object({
    name: extractionFieldSchema,
    price: extractionFieldSchema.extend({ currency: z.string().optional() }),
    image: extractionFieldSchema,
    country: extractionFieldSchema,
    platform: extractionFieldSchema,
    currency: extractionFieldSchema,
    weight: extractionFieldSchema,
    dimensions: extractionFieldSchema,
    volume: extractionFieldSchema,
  }),
  errors: z.array(z.string()),
  fetchedAt: z.string(),
  responseStatus: z.number().nullable(),
});

// ── Order schemas ─────────────────────────────────────────────────────────────

export const createOrderSchema = z.object({
  productUrl: z.url("Must be a valid URL"),
  productName: z
    .string({ error: "Product name is required" })
    .min(1, "Product name is required")
    .max(500, "Product name must be under 500 characters")
    .trim(),
  productImageUrl: z.url("Must be a valid URL").optional(),
  estimatedPriceUsd: z.coerce
    .number<number>({ error: "Estimated price is required" })
    .positive("Price must be positive")
    .max(50_000, "Price exceeds maximum allowed"),
  quantity: z
    .int("Quantity must be a whole number")
    .positive("Quantity must be at least 1")
    .max(100, "Quantity exceeds maximum allowed")
    .default(1),
  originCountry: z.enum(["USA", "UK", "CHINA"], {
    error: "Origin country must be USA, UK, or CHINA",
  }),
  specialInstructions: z
    .string()
    .max(2000, "Special instructions must be under 2000 characters")
    .trim()
    .optional(),
  needsReview: z.boolean().optional(),
  reviewReasons: z.array(z.string()).optional(),
  extractionMetadata: extractionMetadataSchema.optional(),
  extractionData: z.record(z.string(), z.unknown()).optional(),
});

export const reviewOrderSchema = z.object({
  action: z.enum(["approve", "reject"]),
  updates: z
    .object({
      productName: z.string().min(1).max(500).optional(),
      estimatedPriceUsd: z.number().positive().max(50_000).optional(),
      productImageUrl: z.url().optional().nullable(),
      originCountry: z.enum(["USA", "UK", "CHINA"]).optional(),
    })
    .optional(),
  reason: z.string().max(1000).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["pending", "paid", "processing", "in_transit", "delivered", "completed", "cancelled"]),
  trackingNumber: z.string().min(1).max(100).optional(),
  carrier: z.string().min(1).max(100).optional(),
  estimatedDeliveryDate: z.string().optional(),
});


export type CreateOrderSchemaType = z.infer<typeof createOrderSchema>;
export type ReviewOrderSchemaType = z.infer<typeof reviewOrderSchema>;
export type UpdateOrderSchemaType = z.infer<typeof updateOrderStatusSchema>
