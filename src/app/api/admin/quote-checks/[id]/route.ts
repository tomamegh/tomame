import { NextRequest } from "next/server";
import { z } from "zod";

import { getUserSession } from "@/features/auth/services/auth.service";
import { decideQuoteCheckSchema } from "@/features/quote-checks/schema";
import { decideQuoteCheck } from "@/features/quote-checks/services/quote-checks.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * PATCH /api/admin/quote-checks/:id — decide one open check:
 * confirm | correct (price) | unavailable (stock, optional substitute) | dismiss
 * (customer reports). `from` is the status the queue showed; a second admin
 * acting on the same row gets a 409. Audited in the service.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`admin-quote-checks-write:${ip}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    // `user` for the id: `session` holds the JWT claims (see the assisted queue's route).
    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new APIError(404, "Check not found");
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = decideQuoteCheckSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    return successResponse(await decideQuoteCheck(user.id, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
