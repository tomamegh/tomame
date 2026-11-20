import { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { finderRunIdSchema } from "@/features/finder/schema";
import { handOffFinderRun } from "@/features/finder/services/finder-run.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, rateLimitSubject } from "@/lib/rate-limit";
import { resolveViewer } from "@/lib/quote-session";

/**
 * POST /api/finder/:id/handoff — the customer tapped "Ask a buyer on
 * WhatsApp" on a run that found nothing. Writes the assisted request (once per
 * run; a second tap revises it) so the buyers' queue has it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = finderRunIdSchema.safeParse((await params).id);
    if (!id.success) throw new APIError(404, "We have no record of that search.");

    const user = await getAuthenticatedUser();
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);
    if (!(await checkRateLimit(`finder-handoff:${rateLimitSubject(request, user?.id)}`, RATE_LIMIT.assisted)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    return finalize(successResponse(await handOffFinderRun(id.data, viewer), 201));
  } catch (error) {
    return errorResponse(error);
  }
}
