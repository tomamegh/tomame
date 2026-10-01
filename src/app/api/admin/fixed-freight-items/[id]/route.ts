import type { NextRequest } from "next/server";
import { z } from "zod";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { updateFixedFreightItemSchema } from "@/features/pricing/schema";
import { updateFixedFreightItem } from "@/features/pricing/services/fixed-freight-admin.service";
import {
  APIError,
  errorResponse,
  successResponse,
} from "@/lib/auth/api-helpers";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

/** `PATCH /api/admin/fixed-freight-items/:id` — edit or (de)activate one item. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const ip = getClientIp(request);
    if (
      !(await checkRateLimit(`admin-fixed-freight:${ip}`, RATE_LIMIT.admin))
        .allowed
    ) {
      throw new APIError(429, "Too many requests");
    }
    const admin = requireAdmin(requireAuth(await getAuthenticatedUser()));

    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new APIError(404, "Fixed freight item not found");

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = updateFixedFreightItemSchema.safeParse(body);
    if (!parsed.success)
      throw new APIError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid input",
      );

    return successResponse(
      await updateFixedFreightItem(admin, id, parsed.data),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
