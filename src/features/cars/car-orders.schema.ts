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
 * THE RULE THIS FILE EXISTS TO ENFORCE IS THE SHORT ONE: the browser sends an
 * IDENTIFIER AND NOTHING ELSE. No price, no amount, no currency, no quantity.
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
