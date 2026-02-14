import { z } from "zod";
import { ALLOWED_PRODUCT_DOMAINS } from "@/config/constants";

/**
 * Validates that a URL belongs to an allowed e-commerce domain.
 */
function isAllowedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return ALLOWED_PRODUCT_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export const createOrderSchema = z.object({
  productUrl: z
    .string({ error: "Product URL is required" })
    .url("Must be a valid URL")
    .refine(isAllowedDomain, {
      message: `Product URL must be from a supported store (${ALLOWED_PRODUCT_DOMAINS.join(", ")})`,
    }),
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
});
