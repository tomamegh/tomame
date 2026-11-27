import { z } from "zod";

import { createAddressSchema } from "@/features/addresses/schema";
import { CONTACT_PHONE_MESSAGE, normaliseContactPhone } from "@/features/addresses/phone";
import { priceManualQuoteSchema } from "@/features/assisted/schema";
import { chosenOptionsSchema } from "@/features/bag/schema";

/**
 * Staff buying for a customer: links read, size and price settled by the buyer,
 * the order placed under the customer's own account and recorded as paid to us
 * offline. The browser names quotes by id and states facts; every cedi is struck
 * server-side from the snapshots, exactly as a customer's own checkout is.
 */

export const assistedQuoteSchema = z.object({
  product_url: z.url("That does not look like a link").max(2000),
});

/** The buyer's facts for a quote no reader could price (or priced wrongly). */
export const assistedPriceSchema = priceManualQuoteSchema.extend({
  extraction_cache_id: z.uuid("Unknown quote"),
});
export type AssistedPriceInput = z.infer<typeof assistedPriceSchema>;

export const assistedPreviewSchema = z.object({
  extraction_cache_ids: z.array(z.uuid("Unknown quote")).min(1).max(10),
});

/** Trimmed and lower-cased first: an email pasted from WhatsApp often carries a space. */
const customerEmail = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter the customer's email"));

export const customerLookupSchema = z.object({ email: customerEmail });

const customerSchema = z.object({
  email: customerEmail,
  first_name: z.string().trim().min(1, "First name").max(80),
  last_name: z.string().trim().min(1, "Last name").max(80),
  phone: z
    .string()
    .trim()
    .refine((v) => normaliseContactPhone(v) !== null, CONTACT_PHONE_MESSAGE)
    .transform((v) => normaliseContactPhone(v)!),
});
export type AssistedCustomerInput = z.infer<typeof customerSchema>;

const lineSchema = z.object({
  extraction_cache_id: z.uuid("Unknown quote"),
  quantity: z.number().int().min(1).max(100).default(1),
  chosen_options: chosenOptionsSchema.optional(),
  special_instructions: z.string().trim().max(1000).optional(),
});

const deliverySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pickup"), delivery_zone_id: z.uuid("Choose a pickup point") }),
  z.object({ kind: z.literal("address"), delivery_address_id: z.uuid("Choose an address") }),
  z.object({ kind: z.literal("new_address"), address: createAddressSchema }),
]);

export const OFFLINE_PAYMENT_METHODS = ["momo", "bank_transfer", "cash", "card", "other"] as const;
export type OfflinePaymentMethod = (typeof OFFLINE_PAYMENT_METHODS)[number];

export const placeAssistedOrderSchema = z.object({
  customer: customerSchema,
  lines: z.array(lineSchema).min(1, "Add at least one item").max(10),
  delivery: deliverySchema,
  /**
   * `offline`: the customer already paid us (MoMo to Tomame, cash...) and staff record it.
   * `pay_link`: the order waits unpaid; the customer is emailed a link to sign in and pay online.
   */
  payment: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("offline"),
      method: z.enum(OFFLINE_PAYMENT_METHODS),
      /** The MoMo transaction id, bank reference or receipt number the money came in under. */
      reference: z.string().trim().max(120).optional(),
      note: z.string().trim().max(500).optional(),
    }),
    z.object({ mode: z.literal("pay_link") }),
  ]),
  whatsapp_updates: z.boolean().default(true),
});
export type PlaceAssistedOrderInput = z.infer<typeof placeAssistedOrderSchema>;
