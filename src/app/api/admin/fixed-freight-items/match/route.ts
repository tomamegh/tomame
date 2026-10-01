import type { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { testFixedFreightTitleSchema } from "@/features/pricing/schema";
import { testFixedFreightTitle } from "@/features/pricing/services/fixed-freight-admin.service";
import {
  APIError,
  errorResponse,
  successResponse,
} from "@/lib/auth/api-helpers";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * `POST /api/admin/fixed-freight-items/match` — which active item the engine's
 * matcher would pick for a product title (and optional category). Read-only.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (
      !(await checkRateLimit(`admin-fixed-freight:${ip}`, RATE_LIMIT.admin))
        .allowed
    ) {
      throw new APIError(429, "Too many requests");
    }
    requireAdmin(requireAuth(await getAuthenticatedUser()));

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = testFixedFreightTitleSchema.safeParse(body);
    if (!parsed.success)
      throw new APIError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid input",
      );

    return successResponse(await testFixedFreightTitle(parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
