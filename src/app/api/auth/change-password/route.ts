import { NextRequest } from "next/server";
import { z } from "zod";
import { changePassword, getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { logAuditEvent } from "@/features/audit/services/audit.service";

const changePasswordApiSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password: z.string().min(6, "New password must be at least 6 characters"),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`change-password:${ip}`, RATE_LIMIT.auth).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = changePasswordApiSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const data = await changePassword(auth.id, parsed.data.new_password);

    await logAuditEvent({
      actorId: auth.id,
      actorRole: auth.profile.role,
      action: "user_password_changed",
      entityType: "user",
      entityId: auth.id,
    });

    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
