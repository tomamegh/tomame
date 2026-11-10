import { NextRequest } from "next/server";
import { customerRideSchema } from "@/features/order-delivery/customer-ride";
import {
  cancelCustomerRide,
  requestCustomerRide,
} from "@/features/order-delivery/services/customer-ride.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

type Ctx = { params: Promise<{ id: string }> };

async function signedIn() {
  const auth = requireAuth(await getAuthenticatedUser());
  if (!(await checkRateLimit(`order-ride:${auth.id}`, RATE_LIMIT.general)).allowed) {
    throw new APIError(429, "Too many requests");
  }
  return auth;
}

/** `POST /api/orders/:id/ride` — the customer sends (or changes) their own rider (101). */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await signedIn();
    const { id } = await params;
    const body = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = customerRideSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await requestCustomerRide(auth, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}

/** `DELETE /api/orders/:id/ride` — call the rider off; we deliver for free. */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const auth = await signedIn();
    const { id } = await params;
    return successResponse(await cancelCustomerRide(auth, id));
  } catch (error) {
    return errorResponse(error);
  }
}
