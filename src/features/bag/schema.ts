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
