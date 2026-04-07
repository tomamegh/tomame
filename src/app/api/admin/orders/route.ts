import { NextRequest } from "next/server";
import { listAllOrders } from "@/features/orders/services/orders.service";
import {
  getUserSession,
} from "@/features/auth/services/auth.service";
import {
  APIError,
  successResponse,
  errorResponse,
} from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-orders:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    // const user = await getAuthenticatedUser();
    // const auth = requireAuth(user);
    // const admin = requireAdmin(auth);

    const { session, supabase } = await getUserSession();

    if (session.app_metadata?.role !== "admin") {
      throw new APIError(403, "Admin access required");
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? undefined;
    const userId = searchParams.get("userId") ?? undefined;
    const needsReviewParam = searchParams.get("needsReview");
    const needsReview =
      needsReviewParam === "true"
        ? true
        : needsReviewParam === "false"
          ? false
          : undefined;

    const data = await listAllOrders(supabase, { status, userId, needsReview });
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
