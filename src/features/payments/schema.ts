import { z } from "zod";

export const initializePaymentSchema = z.object({
  orderId: z.uuid("Invalid order ID"),
});

export const paymentCallbackSchema = z.object({
  reference: z
    .string()
    .regex(/^TOM_\d+_[a-f0-9]+$/, "Invalid payment reference"),
});

export const paystackWebhookSchema = z.object({
  event: z.string(),
  data: z.object({
    reference: z.string(),
    status: z.string(),
    amount: z.number(),
    currency: z.string(),
  }),
});
