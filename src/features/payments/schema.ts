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

/**
 * A Paystack webhook delivery, validated only as far as we actually read it.
 *
 * ONE URL RECEIVES EVERY EVENT ON THE ACCOUNT. Paystack has no per-event
 * subscription: `charge.success` arrives here, and so do `transfer.*`,
 * `subscription.*`, `invoice.*` and `customeridentification.*`, each with a
 * completely different `data` shape. This schema used to require
 * `data.amount` and `data.currency`, so every one of those deliveries was
 * refused with a 400 — for events `handleWebhookEvent` was going to ignore
 * anyway. Paystack retries a non-2xx and counts it against endpoint health,
 * so the strictness bought nothing and spent the endpoint's reputation.
 *
 * WHY IT IS SAFE TO LOOSEN. Nothing downstream reads `amount` or `currency`
 * from the delivery. The webhook body is a NOTIFICATION, never evidence: the
 * only thing taken from it is the reference, and `handlePaymentCallback` then
 * re-verifies that transaction against Paystack's own API and checks the amount
 * and currency from THAT response. A webhook that claimed a different amount
 * could never have moved money. Keeping the fields required only let a
 * bystander event break the endpoint.
 */
export const paystackWebhookSchema = z.object({
  event: z.string(),
  data: z.looseObject({
    reference: z.string().optional(),
    status: z.string().optional(),
  }),
});

/**
 * A validated delivery, as `handleWebhookEvent` receives it.
 *
 * Inferred from the schema rather than hand-written so the two can never drift,
 * and because `looseObject` carries the index signature through — a test (or a
 * caller) may hand over a whole realistic Paystack payload, extra keys and all,
 * without TypeScript's excess-property check rejecting the literal.
 */
export type PaystackWebhookEvent = z.infer<typeof paystackWebhookSchema>;
