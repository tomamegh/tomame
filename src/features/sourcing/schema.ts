import { z } from "zod";

/**
 * Sourcing requests (065): the item a buyer has to price by hand.
 *
 * WHAT THE CUSTOMER MAY SEND: which quote, and how many. Nothing about money.
 * The two "hint" fields are the quote screen's own gap-fillers travelling along
 * as a note to the buyer — they are stored apart from the `sourced_*` columns
 * precisely so that nothing a browser typed can ever become the number the line
 * is priced against.
 */
export const createSourcingRequestSchema = z.object({
  extraction_cache_id: z.uuid("Unknown quote"),
  quantity: z.coerce.number().int().min(1).max(100).default(1),
  /** The customer's guess at the price, for the buyer's benefit only. */
  estimated_price_usd: z.coerce.number().positive().max(100_000).optional(),
  origin_country: z.enum(["USA", "UK", "CHINA"]).optional(),
});

export type CreateSourcingRequestInput = z.infer<typeof createSourcingRequestSchema>;

/**
 * The buyer's answer.
 *
 * `available` REQUIRES the two facts, enforced here, in the service and by a
 * CHECK constraint. Three layers because this is the exact seam where a request
 * becomes payable: an `available` row with nothing attached would tell the
 * customer we found their item and then hand the bag the same nothing it could
 * not price before.
 *
 * There is no field for a cedi total, and that is the point. The buyer says what
 * the item costs and where it ships from; `calculator.ts` works out what the
 * customer pays, the same way it does for every other line.
 */
export const answerSourcingRequestSchema = z
  .object({
    /**
     * The status this buyer saw. Guards the transition so two people working the
     * queue together are told, rather than one quietly overwriting the other.
     */
    from: z.enum(["requested", "available", "unavailable"]),
    status: z.enum(["available", "unavailable"]),
    price_usd: z.coerce.number().positive("Enter what the item costs").max(100_000).optional(),
    origin_country: z.enum(["USA", "UK", "CHINA"]).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.status !== "available" || (v.price_usd != null && !!v.origin_country), {
    message: "An available item needs its price and the country it ships from",
  });

export type AnswerSourcingRequestInput = z.infer<typeof answerSourcingRequestSchema>;
