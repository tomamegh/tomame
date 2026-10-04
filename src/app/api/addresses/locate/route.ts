import { NextRequest } from "next/server";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { locateSchema } from "@/features/addresses/schema";
import { locateAddress } from "@/features/addresses/services/address-lookup.service";

/**
 * POST /api/addresses/locate — `{ latitude, longitude }` from the device, answered
 * with the address fields Google could fill (088). Signed-in only and rate
 * limited: every call can spend a paid Geocoding request. Saves nothing; the
 * address form posts the pin with the rest of the address.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(await getAuthenticatedUser());
    if (!(await checkRateLimit(`addresses-locate:${auth.id}`, RATE_LIMIT.general)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = locateSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await locateAddress(parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
