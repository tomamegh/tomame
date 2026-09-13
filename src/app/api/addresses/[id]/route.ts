import { NextRequest } from "next/server";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { addressIdSchema, updateAddressSchema } from "@/features/addresses/schema";
import { deleteAddress, updateAddress } from "@/features/addresses/services/addresses.service";

/**
 * PATCH  /api/addresses/:id — edit a saved address or make it the default.
 * DELETE /api/addresses/:id — remove it; deleting the default promotes the oldest.
 * The address must be the caller's own; anything else is a 404.
 */

type Params = { params: Promise<{ id: string }> };

async function prepare(params: Params["params"]) {
  const user = await getAuthenticatedUser();
  const auth = requireAuth(user);
  if (!checkRateLimit(`addresses:${auth.id}`, RATE_LIMIT.general).allowed) throw new APIError(429, "Too many requests");
  const { id } = await params;
  const parsedId = addressIdSchema.safeParse(id);
  if (!parsedId.success) throw new APIError(404, "Address not found");
  return { auth, id: parsedId.data };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { auth, id } = await prepare(params);
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = updateAddressSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await updateAddress(auth.id, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { auth, id } = await prepare(params);
    await deleteAddress(auth.id, id);
    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
