import * as z from "zod";

/**
 * What a request may say about buying a car (migration 068).
 *
 * WHY A SECOND SCHEMA FILE BESIDE `features/cars/schema.ts` RATHER THAN A
 * SECTION INSIDE IT: that file is 067's, covering the admin-authored catalogue
 * and its enquiries, and the purchase path is being built alongside it by
 * different hands. A separate file is a merge that cannot conflict. If the two
 * ever settle, this belongs as a `// ── Orders ──` section in there.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE IS THE SHORT ONE: the CUSTOMER's browser
 * sends an IDENTIFIER AND NOTHING ELSE. (An ADMIN recording an offline balance
 * does send a figure — see `carOrderAdminActionSchema` at the bottom, and the
 * paragraph there about why that one is safe.) No price, no amount, no currency, no quantity.
 * CLAUDE.md: never trust the client — no client-provided price totals. The
 * service reads `car_listings.price_pesewas` server-side and snapshots it onto
 * `car_orders`, and there is deliberately no field here a caller could use to
 * name their own figure for a five-figure vehicle. A schema that accepted an
 * `amount` "for display" would be one careless service edit away from charging
 * it.
 *
 * The buyer is the session, not a field, for the same reason
 * `createCarEnquirySchema` omits it.
 */
export const carCheckoutSchema = z.object({
  carListingId: z.uuid("Unknown car"),
});

export type CarCheckoutInput = z.infer<typeof carCheckoutSchema>;

/**
 * What an admin may say about a car order (migration 069).
 *
 * A DISCRIMINATED UNION ON `action`, not a bag of optional fields, so an empty
 * body can never be read as "release it" and a release can never be read as a
 * receipt. `/api/admin/cars/orders/:id` grows by adding a member here.
 */
export const carOrderAdminActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("release"),
    reason: z
      .string()
      .trim()
      .min(1, "Say why this sale is being unwound.")
      .max(500, "Keep the reason under 500 characters."),
  }),
  z.object({
    action: z.literal("record_balance"),
    /**
     * THE FIGURE RECEIVED, IN PESEWAS, AND IT IS REQUIRED.
     *
     * This is the one place in the car path where a MONEY AMOUNT arrives in a
     * request body, and it is admitted for one reason: the service checks it
     * against `price_pesewas - deposit_pesewas` on the row and refuses anything
     * else, so what the request can do is CONFIRM the balance, never choose it.
     * The alternative — a status button with no number — lets a five-figure debt
     * be declared settled by a misclick and leaves nothing on the row saying
     * what was actually received.
     *
     * An integer, because pesewas are integers: `.int()` rejects `77400.5`
     * rather than rounding it into the database. The house spelling
     * (`z.number().int()`) is used, as everywhere else in this codebase.
     */
    amountPesewas: z
      .number()
      .int("Record the amount in pesewas, as a whole number.")
      .positive("The amount must be more than zero."),
    /** "MTN transfer, ref 88213". Free text for whoever reads this in a year. */
    note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
  }),
]);

export type CarOrderAdminAction = z.infer<typeof carOrderAdminActionSchema>;
