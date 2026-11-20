import { NextRequest } from "next/server";
import { z } from "zod";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { PASTE_BATCH_MAX } from "@/features/extraction/services/paste-batch";
import { previewPastes } from "@/features/extraction/services/paste-batch.service";
import { resolveViewer } from "@/lib/quote-session";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, rateLimitSubject } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const previewSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(PASTE_BATCH_MAX),
});

/**
 * POST /api/pastes/preview — several pasted links priced together (plan 2b).
 *
 * Each priced link's landed total for one, its pay hold, and the batch's
 * combined total and consolidation saving, all from the bag's own pricing.
 * Read-only: nothing goes in the bag. Scoped to the viewer's own pastes.
 * Called when a batch gains a priced link, not on every poll.
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    const user = await getAuthenticatedUser();
    if (!(await checkRateLimit(`pastes-preview:${rateLimitSubject(request, user?.id)}`, RATE_LIMIT.general)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);

    return finalize(successResponse(await previewPastes(viewer, parsed.data.ids)));
  } catch (error) {
    return errorResponse(error);
  }
}
