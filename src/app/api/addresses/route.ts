import { NextRequest } from "next/server";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { createAddressSchema } from "@/features/addresses/schema";
import { createAddress, listAddresses } from "@/features/addresses/services/addresses.service";

/**
 * GET  /api/addresses — the customer's address book.
 * POST /api/addresses — save one (201). The first saved address becomes the default.
 * Signed-in only, unlike the bag: an address is personal data with no anonymous owner.
 */

async function prepare() {
  const user = await getAuthenticatedUser();
  const auth = requireAuth(user);
  if (!checkRateLimit(`addresses:${auth.id}`, RATE_LIMIT.general).allowed) throw new APIError(429, "Too many requests");
  return auth;
}

export async function GET() {
  try {
    const auth = await prepare();
    return successResponse(await listAddresses(auth.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await prepare();
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = createAddressSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await createAddress(auth.id, parsed.data), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
