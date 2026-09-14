import { NextRequest } from "next/server";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { setOnboardingStatusSchema } from "@/features/onboarding/schema";
import { setOnboardingStatus } from "@/features/onboarding/services/onboarding-state.service";

/**
 * Closes the first-run tour for good, one way or the other.
 *
 * HTTP orchestration only (CLAUDE.md): parse, authenticate, hand to the
 * service. The rule that decides whether the tour may START again lives in
 * `tour-predicate.ts`, not here — this route only ever stamps a terminal
 * timestamp; it never clears one, so there is no "replay the tour" path
 * through the API (resetting a customer's own columns to replay it locally is
 * a support/dev action against the database, not a product feature).
 */
export async function PATCH(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = setOnboardingStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    await setOnboardingStatus(auth.id, parsed.data);

    return successResponse({ status: parsed.data.status });
  } catch (error) {
    return errorResponse(error);
  }
}
