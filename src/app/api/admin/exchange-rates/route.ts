import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { getAllRates } from "@/lib/exchange-rates/service";

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`admin-exchange-rates:${ip}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const rates = await getAllRates();
    return successResponse({ rates });
  } catch (error) {
    return errorResponse(error);
  }
}
