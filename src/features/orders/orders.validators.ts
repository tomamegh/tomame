import { z } from "zod";

export const createOrderSchema = z.object({
  productUrl: z
    .string({ error: "Product URL is required" })
    .url("Must be a valid URL"),
  productName: z
    .string({ error: "Product name is required" })
    .min(1, "Product name is required")
    .max(500, "Product name must be under 500 characters")
    .trim(),
  productImageUrl: z.string().url("Must be a valid URL").optional(),
  estimatedPriceUsd: z
    .number({ error: "Estimated price is required" })
    .positive("Price must be positive")
    .max(50_000, "Price exceeds maximum allowed"),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .positive("Quantity must be at least 1")
    .max(100, "Quantity exceeds maximum allowed")
    .optional()
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
  extractionMetadata: z.record(z.string(), z.unknown()).optional(),
});
