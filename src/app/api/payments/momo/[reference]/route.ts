import { NextRequest } from "next/server";
import { paymentCallbackSchema } from "@/features/payments/schema";
import { getMomoPaymentState } from "@/features/payments/services/momo.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";

/** GET /api/payments/momo/:reference — where the prompt stands; settles it once Paystack has an outcome. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  try {
    const auth = requireAuth(await getAuthenticatedUser());
    const parsed = paymentCallbackSchema.safeParse({ reference: (await params).reference });
    if (!parsed.success) throw new APIError(400, "Invalid payment reference");

    return successResponse(await getMomoPaymentState(auth, parsed.data.reference));
  } catch (error) {
    return errorResponse(error);
  }
}
