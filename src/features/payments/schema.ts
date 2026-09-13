import { z } from "zod";

/** One order (legacy) or one order group (the bag). `channel` is a `PaymentChannel.id`. */
export const initializePaymentSchema = z
  .object({
    orderId: z.uuid("Invalid order ID").optional(),
    orderGroupId: z.uuid("Invalid order group").optional(),
    channel: z.string().trim().min(1).max(40).optional(),
  })
  .refine((v) => (v.orderId != null) !== (v.orderGroupId != null), { message: "Provide orderId or orderGroupId" });
export type InitializePaymentInput = z.infer<typeof initializePaymentSchema>;

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
