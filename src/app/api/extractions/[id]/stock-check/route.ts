import { NextRequest } from "next/server";
import { z } from "zod";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requestStockCheck } from "@/features/quote-checks/services/quote-checks.service";
import { resolveViewer } from "@/lib/quote-session";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, rateLimitSubject } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * POST /api/extractions/:id/stock-check — "We confirm stock and condition
 * before you pay" (A7). Opens the stock check for this quote if it needs one
 * (staff are alerted) and returns the customer's view of it, including the
 * WhatsApp link with the item and quote reference filled in. Public, like the
 * rest of the quote flow. 404 when the quote does not need a stock check.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new APIError(404, "Quote not found");

    const user = await getAuthenticatedUser();
    if (!(await checkRateLimit(`stock-check:${rateLimitSubject(request, user?.id)}`, RATE_LIMIT.general)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);

    const view = await requestStockCheck(viewer, id);
    if (!view) throw new APIError(404, "This item does not need a stock check");
    return finalize(successResponse(view));
  } catch (error) {
    return errorResponse(error);
  }
}
