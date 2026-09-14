import { z } from "zod";

/**
 * What `PATCH /api/app/onboarding` accepts.
 *
 * One of two terminal facts, per `tour-predicate.ts`: the customer walked
 * every stop, or closed the tour early. Never both, never neither.
 */
export const setOnboardingStatusSchema = z.object({
  status: z.enum(["completed", "dismissed"]),
});

export type SetOnboardingStatusInput = z.infer<typeof setOnboardingStatusSchema>;
