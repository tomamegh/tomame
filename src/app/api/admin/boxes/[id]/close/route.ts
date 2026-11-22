import { NextRequest } from "next/server";

import { closeBoxByStaff } from "@/features/bag/services/box-admin.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/** POST /api/admin/boxes/:id/close — a staff close (111). The box keeps its departure and contents. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await checkRateLimit(`admin-boxes-write:${getClientIp(request)}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");
    const { id } = await params;
    return successResponse(await closeBoxByStaff(user.id, id));
  } catch (error) {
    return errorResponse(error);
  }
}
