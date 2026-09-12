import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { watchIdSchema } from "@/features/watches/schema";
import { deleteWatch } from "@/features/watches/services/watches.service";

/**
 * DELETE /api/watches/:id — stop watching.
 *
 * A watch the caller does not own answers 404, never 403: a 403 would confirm
 * that the id exists, which is enough to enumerate other customers' watches.
 * A malformed id gets the same 404 for the same reason.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    if (!checkRateLimit(`watches-delete:${auth.id}`, RATE_LIMIT.watches).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { id } = await params;
    const parsed = watchIdSchema.safeParse(id);
    if (!parsed.success) throw new APIError(404, "Watch not found");

    return successResponse(await deleteWatch(auth.id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
