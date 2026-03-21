import { z } from "zod";

export const updatePricingConfigSchema = z.object({
  region: z.enum(["USA", "UK", "CHINA"], {
    error: "Region must be USA, UK, or CHINA",
  }),
  baseShippingFeeUsd: z
    .number({ error: "Base shipping fee is required" })
    .positive("Base shipping fee must be positive"),
  exchangeRate: z
    .number({ error: "Exchange rate is required" })
    .positive("Exchange rate must be positive"),
  serviceFeePercentage: z
    .number({ error: "Tax percentage is required" })
    .min(0, "Tax percentage cannot be negative")
    .max(1, "Tax percentage must be between 0 and 1"),
});

export type UpdatePricingConfigSchemaType = z.infer<typeof updatePricingConfigSchema>
