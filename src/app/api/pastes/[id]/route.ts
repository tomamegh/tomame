import { NextRequest } from "next/server";

import { getExtractionRequestForViewer } from "@/db/queries/extraction-requests";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { toPasteStatus } from "@/features/extraction/services/paste-status";
import { resolveViewer } from "@/lib/quote-session";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * GET /api/pastes/:id — how is that link coming along?
 *
 * The screen polls this while it waits, and switches to the quote the moment
 * `status` is `ready`. Scoped to the viewer who owns the row — a signed-out one
 * through the `tm_quote_session` cookie — so a paste id cannot be used to read
 * somebody else's.
 *
 * 404 rather than 403 for a row owned by another viewer: whether a given id
 * exists is not something a stranger should be able to learn.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`paste-read:${ip}`, RATE_LIMIT.general).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { id } = await params;
    const user = await getAuthenticatedUser();
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);

    const row = await getExtractionRequestForViewer(id, viewer);
    if (!row) throw new APIError(404, "We have no record of that link");

    return finalize(successResponse(toPasteStatus(row)));
  } catch (error) {
    return errorResponse(error);
  }
}
