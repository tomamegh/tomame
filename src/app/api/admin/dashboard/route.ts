import { NextRequest } from "next/server";
import { getDashboardData } from "@/features/admin/admin.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-dashboard:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const data = await getDashboardData(createAdminClient());
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
