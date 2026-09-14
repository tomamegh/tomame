import * as z from "zod";

/**
 * What a customer may say about the photograph of their parcel (migration 054).
 *
 * `looks_right` is a first-class verdict, not an afterthought: the whole point
 * of showing the picture is to learn whether the right thing was bought, and a
 * form that only accepted complaints would discard every confirmation.
 *
 * `message` is OPTIONAL here and made non-empty by the service. The column is
 * NOT NULL with a `length(btrim(message)) > 0` CHECK, but requiring a customer
 * to type a sentence in order to tap "Looks right" would cost us the signal we
 * most want — so the service supplies the words for that verdict and insists on
 * them for every other one. Validation that depends on another field is a rule,
 * and rules live in the service.
 */
export const submitOrderFeedbackSchema = z.object({
  verdict: z.enum(["looks_right", "wrong_item", "wrong_variant", "damaged", "other"], {
    error: "Tell us whether the photo looks right",
  }),
  message: z.string().trim().max(2000, "Keep it under 2000 characters").optional(),
  /**
   * The photo being objected to, when there is one. Null for feedback about the
   * parcel in general. Never trusted as authorization — the ORDER's ownership is
   * what the route checks.
   */
  photo_id: z.uuid("Unknown photo").nullable().optional(),
});

export type SubmitOrderFeedbackInput = z.infer<typeof submitOrderFeedbackSchema>;

/**
 * Admin: claim or close one row.
 *
 * `from` is required and is the status the admin saw when they opened the
 * queue. The transition is guarded on it so two of them cannot both claim one
 * customer's objection — the second gets a 409 rather than silently overwriting.
 */
export const transitionOrderFeedbackSchema = z.object({
  from: z.enum(["open", "in_review", "resolved", "dismissed"]),
  status: z.enum(["in_review", "resolved", "dismissed"]),
  /** What was actually done about it — the half the customer gets to read. */
  resolution: z.string().trim().max(2000).nullable().optional(),
});

export type TransitionOrderFeedbackInput = z.infer<typeof transitionOrderFeedbackSchema>;
