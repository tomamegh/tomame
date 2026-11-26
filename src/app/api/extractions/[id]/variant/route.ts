import { NextRequest, after } from "next/server";
import { z } from "zod";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { quoteVariant } from "@/features/extraction/services/variant-quote.service";
import { resolveViewer } from "@/lib/quote-session";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, rateLimitSubject } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const bodySchema = z.object({ variant_id: z.string().regex(/^\d{1,20}$/, "Pick an option") });

/**
 * POST /api/extractions/:id/variant — another size or colour of a quoted item.
 * Answers with the quote id for that variant; the screen moves to it.
 *
 * Public like the rest of the quote flow. A pick is not a new paste, so it
 * does not spend a visitor's free looks; it has its own bucket.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new APIError(404, "Quote not found");

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    const user = await getAuthenticatedUser();
    if (!(await checkRateLimit(`variant-pick:${rateLimitSubject(request, user?.id)}`, RATE_LIMIT.variantPick)).allowed) {
      throw new APIError(429, "Too many changes. Wait a minute and try again.");
    }
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);

    const { enrich, extraction_cache_id } = await quoteVariant(viewer, id, parsed.data.variant_id);
    if (enrich) after(enrich);
    return finalize(successResponse({ extraction_cache_id }));
  } catch (error) {
    return errorResponse(error);
  }
}
