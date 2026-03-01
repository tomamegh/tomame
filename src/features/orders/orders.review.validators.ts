import { z } from "zod";

export const reviewOrderSchema = z.object({
  action: z.enum(["approve", "reject"]),
  updates: z
    .object({
      productName: z.string().min(1).max(500).optional(),
      estimatedPriceUsd: z.number().positive().max(50_000).optional(),
      productImageUrl: z.string().url().optional().nullable(),
      originCountry: z.enum(["USA", "UK", "CHINA"]).optional(),
    })
    .optional(),
  reason: z.string().max(1000).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["pending", "approved", "paid", "processing", "in_transit", "delivered", "completed", "cancelled"]),
  trackingNumber: z.string().min(1).max(100).optional(),
  carrier: z.string().min(1).max(100).optional(),
  estimatedDeliveryDate: z.string().optional(),
});
