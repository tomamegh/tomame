import { NextRequest } from "next/server";
import { cancelOrderByUser } from "@/features/orders/services/orders.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!(await checkRateLimit(`order-cancel:${auth.id}`, RATE_LIMIT.general)).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { id } = await params;
    const data = await cancelOrderByUser(auth, id);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
