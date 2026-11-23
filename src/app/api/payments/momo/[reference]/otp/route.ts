import { NextRequest } from "next/server";
import { momoOtpSchema, paymentCallbackSchema } from "@/features/payments/schema";
import { submitMomoOtp } from "@/features/payments/services/momo.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/** POST /api/payments/momo/:reference/otp — the network's code for a prompt that asked for one. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  try {
    const auth = requireAuth(await getAuthenticatedUser());
    if (!(await checkRateLimit(`payments-otp:${auth.id}`, RATE_LIMIT.payments)).allowed) {
      throw new APIError(429, "Too many attempts. Please wait a few minutes and try again.");
    }
    const ref = paymentCallbackSchema.safeParse({ reference: (await params).reference });
    if (!ref.success) throw new APIError(400, "Invalid payment reference");

    const body: unknown = await request.json().catch(() => { throw new APIError(400, "Invalid JSON"); });
    const parsed = momoOtpSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    return successResponse(await submitMomoOtp(auth, ref.data.reference, parsed.data.otp));
  } catch (error) {
    return errorResponse(error);
  }
}
