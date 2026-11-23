import { successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { getCheckoutContext } from "@/features/bag/services/checkout-context.service";

/**
 * GET /api/cart/checkout-context — what the quote's checkout panel needs when it
 * opens. Public like the bag: a signed-out viewer gets the channels and zones,
 * and Pay sends them to sign in.
 */
export async function GET() {
  try {
    return successResponse(await getCheckoutContext(await getAuthenticatedUser()));
  } catch (error) {
    return errorResponse(error);
  }
}
