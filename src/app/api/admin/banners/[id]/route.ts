import { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { bannerIdSchema, updateBannerSchema } from "@/features/banners/schema";
import { editBanner, removeBanner } from "@/features/banners/services/banners.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";

/** PATCH / DELETE /api/admin/banners/:id (089). */

async function prepare(params: Promise<{ id: string }>) {
  const admin = requireAdmin(requireAuth(await getAuthenticatedUser()));
  if (!(await checkRateLimit(`admin-banners:${admin.id}`, RATE_LIMIT.admin)).allowed) {
    throw new APIError(429, "Too many requests");
  }
  const id = bannerIdSchema.safeParse((await params).id);
  if (!id.success) throw new APIError(404, "That banner no longer exists");
  return { actor: { id: admin.id, email: admin.email ?? null }, id: id.data };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor, id } = await prepare(params);
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = updateBannerSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await editBanner(actor, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor, id } = await prepare(params);
    await removeBanner(actor, id);
    return successResponse({ id });
  } catch (error) {
    return errorResponse(error);
  }
}
