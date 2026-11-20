import { NextRequest } from "next/server";
import { z } from "zod";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { reportWrongPriceSchema } from "@/features/quote-checks/schema";
import { reportWrongPrice } from "@/features/quote-checks/services/quote-checks.service";
import { resolveViewer } from "@/lib/quote-session";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, rateLimitSubject } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * POST /api/extractions/:id/price-report — "Report a wrong price" (A0).
 * A row in the staff price queue and a staff alert. It never changes the price
 * or the pay hold: staff check the store and correct the quote if it is wrong.
 * Public; rate-limited like the assisted-request form.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new APIError(404, "Quote not found");

    const body: unknown = await request.json().catch(() => ({}));
    const parsed = reportWrongPriceSchema.safeParse(body ?? {});
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    const user = await getAuthenticatedUser();
    if (!(await checkRateLimit(`price-report:${rateLimitSubject(request, user?.id)}`, RATE_LIMIT.assisted)).allowed) {
      throw new APIError(429, "You have sent a few of these. Give us a moment to look.");
    }
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);

    return finalize(successResponse(await reportWrongPrice(viewer, id, parsed.data), 201));
  } catch (error) {
    return errorResponse(error);
  }
}
