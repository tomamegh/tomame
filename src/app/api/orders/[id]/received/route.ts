import { NextRequest } from "next/server";
import { confirmOrderReceivedByUser } from "@/features/orders/services/orders.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/** `POST /api/orders/:id/received` — the customer has the parcel (098). Their own order only. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!(await checkRateLimit(`order-received:${auth.id}`, RATE_LIMIT.general)).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { id } = await params;
    const data = await confirmOrderReceivedByUser(auth, id);
    return successResponse({ id: data.id, status: data.status });
  } catch (error) {
    return errorResponse(error);
  }
}
