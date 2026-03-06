import type { NextRequest } from "next/server";
import { listTransactions } from "@/features/transactions/transactions.service";
import { getAuthenticatedUser } from "@/features/auth/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-transactions:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!auth.ok) throw new APIError(auth.status, auth.error);
    const admin = requireAdmin(auth.user);
    if (!admin.ok) throw new APIError(admin.status, admin.error);

    const result = await listTransactions(createAdminClient(), admin.user);
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}
