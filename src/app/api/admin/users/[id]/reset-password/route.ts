import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { getUserById, adminResetUserPassword } from "@/features/users/services/users.service";

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
    const targetUser = await getUserById(createAdminClient(), id);
    if (!targetUser) throw new APIError(404, "User not found");

    const result = await adminResetUserPassword(admin, targetUser);

    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
