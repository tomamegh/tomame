import { z } from "zod";
import { HUBTEL_CHANNELS } from "@/lib/hubtel/client";

const referenceSchema = z
  .string()
  .regex(/^TOM_\d+_[a-f0-9]+$/, "Invalid payment reference");

export const initializePaymentSchema = z.object({
  orderId: z.uuid("Invalid order ID"),
  /**
   * Accepts the shapes Ghanaian customers actually type; the server normalises
   * to 0XXXXXXXXX before calling Hubtel.
   */
  msisdn: z
    .string()
    .trim()
    .regex(
      /^(?:\+?233|0)\d{9}$/,
      "Enter a valid Ghanaian mobile money number",
    ),
  channel: z.enum([
    HUBTEL_CHANNELS.MTN,
    HUBTEL_CHANNELS.TELECEL,
    HUBTEL_CHANNELS.AIRTELTIGO,
  ]),
});

export const paymentStatusSchema = z.object({
  reference: referenceSchema,
});

/**
 * Hubtel's callback body. Deliberately permissive: it is only used to learn
 * *which* transaction changed. The status is always re-fetched from Hubtel's
 * Transaction Status Check API, because these callbacks are unsigned.
 */
export const hubtelCallbackSchema = z.object({
  ResponseCode: z.string().optional(),
  Message: z.string().optional(),
  Data: z
    .object({
      ClientReference: z.string().optional(),
      TransactionId: z.string().optional(),
      ExternalTransactionId: z.string().optional(),
      Amount: z.number().optional(),
      Description: z.string().optional(),
    })
    .nullish(),
});
