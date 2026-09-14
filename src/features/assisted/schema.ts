import { z } from "zod";

/** Same shape the address book accepts: 024 555 0192, +233 24 555 0192, 0245550192. */
const PHONE_RE = /^\+?[0-9][0-9 ()-]{7,18}$/;

/**
 * "Tell us what you want and a buyer will sort it out."
 *
 * The link is NOT taken from the body. The customer is describing a paste we
 * already hold, so the server reads the URL off the `extraction_request` row —
 * otherwise the description and the link could disagree, and the buyer would be
 * shopping for the wrong thing. A bare `product_url` is accepted only when there
 * is no paste to point at (the Buy-for-me screen's link-free path, G4).
 */
export const createAssistedRequestSchema = z
  .object({
    extraction_request_id: z.uuid("Unknown link").optional(),
    product_url: z.url("That does not look like a link").max(2000).optional(),
    description: z
      .string()
      .trim()
      .min(10, "A sentence or two is enough. What is it you want?")
      .max(2000),
    phone: z.string().trim().regex(PHONE_RE, "Enter a number we can reach you on"),
  })
  .refine((v) => !!v.extraction_request_id || !!v.product_url, {
    message: "Name the link you are asking about",
  });

export type CreateAssistedRequestInput = z.infer<typeof createAssistedRequestSchema>;

/** Admin: move a request along. `note` is the buyer's own record of what happened. */
export const transitionAssistedRequestSchema = z.object({
  status: z.enum(["contacted", "resolved", "cancelled"]),
  note: z.string().trim().max(2000).nullable().optional(),
});

export type TransitionAssistedRequestInput = z.infer<typeof transitionAssistedRequestSchema>;
