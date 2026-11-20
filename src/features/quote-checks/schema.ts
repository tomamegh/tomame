import { z } from "zod";

/** "Report a wrong price": what the customer sees on the store, and a note. Both optional. */
export const reportWrongPriceSchema = z.object({
  seen_price: z.coerce.number().positive("Enter the price you see").max(999_999).optional(),
  note: z.string().trim().max(500).optional(),
});

export type ReportWrongPriceInput = z.infer<typeof reportWrongPriceSchema>;

export const QUOTE_CHECK_ACTIONS = ["confirm", "correct", "unavailable", "dismiss"] as const;
export type QuoteCheckAction = (typeof QUOTE_CHECK_ACTIONS)[number];

/** Staff: decide one open check. `from` is the status the queue showed them. */
export const decideQuoteCheckSchema = z
  .object({
    from: z.enum(["checking", "pending", "confirmed", "corrected", "unavailable", "dismissed", "lapsed"]),
    action: z.enum(QUOTE_CHECK_ACTIONS),
    note: z.string().trim().max(500).optional(),
    price: z.coerce.number().positive("Enter the price the store shows").max(999_999).optional(),
    substitute_url: z
      .string()
      .trim()
      .url("That does not look like a link")
      .refine((u) => /^https:\/\//i.test(u), "Use the https link from the store")
      .max(2000)
      .optional(),
  })
  .refine((v) => v.action !== "correct" || v.price != null, { message: "Enter the price the store shows", path: ["price"] });

export type DecideQuoteCheckInput = z.infer<typeof decideQuoteCheckSchema>;
