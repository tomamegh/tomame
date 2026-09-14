import { NextRequest } from "next/server";

import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { removeOrderPhoto } from "@/features/order-photos/services/order-photos.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * DELETE /api/admin/orders/:id/photos/:photoId — take one picture back down.
 *
 * The order id in the path is not decoration: the service refuses a photo that
 * belongs to a different order, so a mistyped URL cannot delete a picture from
 * someone else's parcel. The object is removed with the row, and `audit_logs`
 * keeps a description of what went — it is the only remaining trace.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-order-photos:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const { id, photoId } = await params;
    const photo = await removeOrderPhoto(
      { id: user.id, email: user.email ?? null },
      id,
      photoId,
    );

    return successResponse({ deleted: photo });
  } catch (error) {
    return errorResponse(error);
  }
}
