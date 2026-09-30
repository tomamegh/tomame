import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { setUserActive } from "@/features/users/services/users.service";

const statusSchema = z.object({ active: z.boolean() });

/** `POST /api/admin/users/[id]/status` — `{ active: false }` deactivates, `{ active: true }` reactivates. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`admin-users:${ip}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const { id } = await params;
    const parsed = statusSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(400, "Expected { active: boolean }");

    const data = await setUserActive(admin, id, parsed.data.active);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
