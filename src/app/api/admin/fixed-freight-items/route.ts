import type { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { createFixedFreightItemSchema } from "@/features/pricing/schema";
import {
  createFixedFreightItem,
  listFixedFreightItemsForAdmin,
} from "@/features/pricing/services/fixed-freight-admin.service";
import {
  APIError,
  errorResponse,
  successResponse,
} from "@/lib/auth/api-helpers";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * `GET /api/admin/fixed-freight-items` — the whole fixed freight price list,
 * deactivated rows included. `POST` adds an item. There is no DELETE: quotes
 * keep the id of the item that priced them, so a row is retired by PATCHing
 * `is_active` to false.
 */
async function guard(request: NextRequest) {
  const ip = getClientIp(request);
  if (
    !(await checkRateLimit(`admin-fixed-freight:${ip}`, RATE_LIMIT.admin))
      .allowed
  ) {
    throw new APIError(429, "Too many requests");
  }
  return requireAdmin(requireAuth(await getAuthenticatedUser()));
}

export async function GET(request: NextRequest) {
  try {
    await guard(request);
    return successResponse({ items: await listFixedFreightItemsForAdmin() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await guard(request);
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = createFixedFreightItemSchema.safeParse(body);
    if (!parsed.success)
      throw new APIError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid input",
      );
    return successResponse(
      await createFixedFreightItem(admin, parsed.data),
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
