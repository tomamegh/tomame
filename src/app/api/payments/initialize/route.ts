import { NextRequest } from "next/server";
import { initializePaymentSchema } from "@/features/payments/schema";
import { initializePayment } from "@/features/payments/services/payments.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(await getAuthenticatedUser());
    // Per user: one mobile-carrier IP is shared by many customers.
    if (!(await checkRateLimit(`payments-init:${auth.id}`, RATE_LIMIT.payments)).allowed) {
      throw new APIError(429, "Too many payment attempts. Please wait a few minutes and try again.");
    }

    const body: unknown = await request.json().catch(() => { throw new APIError(400, "Invalid JSON"); });
    const parsed = initializePaymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const data = await initializePayment(auth, parsed.data);
    return successResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
