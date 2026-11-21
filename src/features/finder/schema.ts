import { z } from "zod";

import { FINDER } from "@/config/finder";

/**
 * What the browser may say to the finder: the words, an optional budget and
 * where to send the answer. No price, no store, no listing: the server finds
 * and prices everything itself.
 */
export const startFinderSchema = z.object({
  query: z
    .string()
    .trim()
    .min(FINDER.minQueryLength, "Tell us what you are looking for, in a few words.")
    .max(FINDER.maxQueryLength, "That is a lot to search for at once. Name one product."),
  budget_ghs: z.number().int().positive().max(10_000_000).nullable().optional(),
  email: z.email("That email address does not look right").max(254).nullable().optional(),
  notify_whatsapp: z.boolean().optional(),
});
export type StartFinderBody = z.infer<typeof startFinderSchema>;

export const updateFinderContactSchema = z
  .object({
    email: z.email("That email address does not look right").max(254).nullable().optional(),
    notify_whatsapp: z.boolean().optional(),
  })
  .refine((v) => v.email !== undefined || v.notify_whatsapp !== undefined, { message: "Nothing to update" });
export type UpdateFinderContactBody = z.infer<typeof updateFinderContactSchema>;

export const finderRunIdSchema = z.uuid("Unknown search");

/** One message to the shopping assistant (107): words only, never a price, store or listing. */
export const chatMessageSchema = z.object({
  chat_id: z.uuid("Unknown chat").nullable().optional(),
  text: z
    .string()
    .trim()
    .min(1, "Say what you are looking for.")
    .max(1_000, "That is a long message. Try saying it in fewer words."),
  email: z.email("That email address does not look right").max(254).nullable().optional(),
});
export type ChatMessageBody = z.infer<typeof chatMessageSchema>;

export const chatEmailSchema = z.object({ email: z.email("That email address does not look right").max(254) });
