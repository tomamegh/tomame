import { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { createBannerSchema } from "@/features/banners/schema";
import { createBanner } from "@/features/banners/services/banners.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";

/** POST /api/admin/banners — create a banner (089). Auth, validation and status codes only. */
export async function POST(request: NextRequest) {
  try {
    const admin = requireAdmin(requireAuth(await getAuthenticatedUser()));
    if (!(await checkRateLimit(`admin-banners:${admin.id}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = createBannerSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await createBanner({ id: admin.id, email: admin.email ?? null }, parsed.data), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
