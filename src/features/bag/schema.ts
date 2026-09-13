import { z } from "zod";

/**
 * What the browser may say when adding to the bag: WHICH stored quote, how many,
 * a note, and the two gap-fillers the quote screen offers only when the
 * extraction left that gap. No price, no rate, no lock id — the server prices
 * from its own snapshot (see `bag.service.ts`).
 */
export const addToBagSchema = z.object({
  extraction_cache_id: z.uuid("Unknown quote"),
  quantity: z.number().int().min(1).max(100).default(1),
  special_instructions: z.string().trim().max(1000).optional(),
  estimated_price_usd: z.number().positive().max(1_000_000).optional(),
  origin_country: z.enum(["USA", "UK", "CHINA"]).optional(),
});
export type AddToBagInput = z.infer<typeof addToBagSchema>;

export const updateBagLineSchema = z
  .object({
    quantity: z.number().int().min(1).max(100).optional(),
    special_instructions: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((v) => v.quantity != null || v.special_instructions !== undefined, { message: "Nothing to update" });
export type UpdateBagLineInput = z.infer<typeof updateBagLineSchema>;

export const bagLineIdSchema = z.uuid("Unknown bag line");

/** `PATCH /api/cart` — choose where the bag goes. Exactly one of the two; null clears the choice. */
export const setBagDeliverySchema = z
  .object({
    delivery_address_id: z.uuid("Unknown address").nullable().optional(),
    delivery_zone_id: z.uuid("Unknown pickup point").nullable().optional(),
  })
  .refine((v) => (v.delivery_address_id !== undefined) !== (v.delivery_zone_id !== undefined), {
    message: "Choose an address or a pickup point",
  });
export type SetBagDeliveryInput = z.infer<typeof setBagDeliverySchema>;

/**
 * `POST /api/cart/checkout`. The body may (re)state the delivery choice; the
 * cart's stored choice is used when it does not. Nothing about money.
 */
export const checkoutSchema = z
  .object({
    delivery_address_id: z.uuid("Unknown address").optional(),
    delivery_zone_id: z.uuid("Unknown pickup point").optional(),
  })
  .refine((v) => !(v.delivery_address_id && v.delivery_zone_id), { message: "Choose an address or a pickup point, not both" });
export type CheckoutInput = z.infer<typeof checkoutSchema>;
