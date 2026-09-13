import { NextRequest } from "next/server";

import { createAssistedRequestSchema } from "@/features/assisted/schema";
import { createAssistedRequest } from "@/features/assisted/services/assisted.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { resolveViewer } from "@/lib/quote-session";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * POST /api/assisted-requests — "tell us what you want and a buyer will sort it out".
 *
 * Public, like the rest of the quote flow: extraction failing is exactly when a
 * visitor should not be asked to make an account first. A signed-out viewer is
 * identified by the `tm_quote_session` cookie, so the buyer can still tie the
 * request to the bag it came from.
 *
 * The link is never taken from the body when a paste is named — see the service.
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = createAssistedRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`assisted:${ip}`, RATE_LIMIT.general).allowed) {
      throw new APIError(429, "Too many requests. Please wait a moment.");
    }

    const user = await getAuthenticatedUser();
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);

    return finalize(successResponse(await createAssistedRequest(viewer, parsed.data), 201));
  } catch (error) {
    return errorResponse(error);
  }
}
