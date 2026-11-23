import { NextRequest } from "next/server";
import { z } from "zod";

import { moveDepartureByStaff } from "@/features/bag/services/departure-admin.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time"),
});

/** POST /api/admin/departures/:id/move — ops moves a flight (124); its orders are re-dated and their customers told. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await checkRateLimit(`admin-boxes-write:${getClientIp(request)}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid request");
    const { id } = await params;
    return successResponse(await moveDepartureByStaff(user.id, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
