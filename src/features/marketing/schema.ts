import * as z from "zod";

// ── Waitlist ─────────────────────────────────────────────────────────────────

/**
 * What the CLIENT may say when joining a waitlist. `region_code` is checked
 * for shape only — whether the lane exists, and whether it is one you can
 * actually wait for, is settled against the `regions` table in the service.
 */
export const waitlistSignupSchema = z.object({
  email: z
    .email("Enter a valid email address")
    .max(254, "Email address is too long"),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(24, "Phone number is too long")
    .optional(),
  region_code: z
    .string()
    .trim()
    .min(2, "A region is required")
    .max(16, "Unknown region"),
});

export type WaitlistSignupSchemaType = z.infer<typeof waitlistSignupSchema>;

// ── Fees worked example ──────────────────────────────────────────────────────

/**
 * The admin-editable INPUT to the Fees-page worked example, stored at
 * `site_settings.fees_worked_example`. Only the input is authored; every
 * number on the page comes back from `calculatePricing`.
 */
export const workedExampleInputSchema = z.object({
  subject: z.string().min(1).max(200),
  item_price_usd: z.number().positive().max(50_000),
  quantity: z.int().positive().max(100).default(1),
  category: z.string().min(1).max(120),
  product_title: z.string().min(1).max(200),
  /** Key into PRODUCT_IMAGES (src/config/marketing-images.ts). null renders the striped placeholder. */
  product_image_key: z.string().max(64).nullable().default(null),
  weight_lbs: z.number().positive().max(500).nullable().default(null),
  region: z.enum(["usa", "uk", "china"]).default("usa"),
  price_presets_usd: z
    .array(z.number().positive().max(50_000))
    .min(1)
    .max(4)
    .default([]),
});

export type WorkedExampleInputSchemaType = z.infer<
  typeof workedExampleInputSchema
>;
