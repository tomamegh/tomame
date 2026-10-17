import { z } from "zod";

import { normaliseGhanaPhone } from "@/features/order-delivery/schema";

/**
 * Sourcing requests (065): the item a buyer has to price by hand.
 *
 * WHAT THE CUSTOMER MAY SEND: which quote, and how many. Nothing about money.
 * The two "hint" fields are the quote screen's own gap-fillers travelling along
 * as a note to the buyer — they are stored apart from the `sourced_*` columns
 * precisely so that nothing a browser typed can ever become the number the line
 * is priced against.
 */
/**
 * The name a buyer asks for (097). Prefilled from the profile, where either half
 * may be NULL — so null and undefined read as empty and get the plain message,
 * never zod's "expected string, received null" (the profile-form bug of
 * 2026-09-30). Inner whitespace is collapsed so "Kwame   Mensah" is stored once.
 */
export const sourcingContactNameSchema = z
  .string()
  .nullish()
  .transform((value) => (value ?? "").trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1, "Tell us your name").max(120, "Your name must be 120 characters or less"));

/**
 * A Ghana phone number in any way people type it — 0244123456, 024 412 3456,
 * +233244123456, 233244123456, with spaces or dashes — stored ONE way, E.164
 * `+233244123456`, by `normaliseGhanaPhone` (the courier hand-off's rule, 075).
 * Its own output parses to itself, so the form can send the parsed value and the
 * route parse it again. Null/empty from a blank profile gets "enter one", not a
 * type error; something typed that cannot be a Ghana number says what we want.
 */
export const sourcingContactPhoneSchema = z
  .string()
  .nullish()
  .transform((value, ctx) => {
    const raw = (value ?? "").trim();
    const phone = raw ? normaliseGhanaPhone(raw) : null;
    if (phone) return phone;
    ctx.addIssue({
      code: "custom",
      message: raw
        ? "That doesn't look like a Ghana number. Try 024 412 3456 or +233 24 412 3456."
        : "Enter a phone number we can reach you on",
    });
    return z.NEVER;
  });

export const createSourcingRequestSchema = z.object({
  extraction_cache_id: z.uuid("Unknown quote"),
  /** Who the buyer calls about it (097). Required on every new request. */
  contact_name: sourcingContactNameSchema,
  contact_phone: sourcingContactPhoneSchema,
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
