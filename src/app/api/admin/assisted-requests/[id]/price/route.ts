import { NextRequest } from "next/server";

import { priceManualQuoteSchema } from "@/features/assisted/schema";
import { priceManualQuote } from "@/features/assisted/services/manual-quote.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/** POST /api/admin/assisted-requests/:id/price — a buyer prices a failed paste by hand (110). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`admin-assisted-write:${ip}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const { id } = await params;
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = priceManualQuoteSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    return successResponse(await priceManualQuote(user.id, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
