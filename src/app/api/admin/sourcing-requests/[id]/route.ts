import { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { getUserSession } from "@/features/auth/services/auth.service";
import { answerSourcingRequestSchema } from "@/features/sourcing/schema";
import { answerSourcing } from "@/features/sourcing/services/sourcing.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * PATCH /api/admin/sourcing-requests/:id — the buyer's answer (065).
 *
 * This is the seam where an item becomes payable, so the two facts that make it
 * payable are required by the schema, again by the service, and a third time by
 * a CHECK constraint. What is NOT accepted anywhere is a cedi total: the buyer
 * says what the item costs and where it ships from, and the pricing engine works
 * out the rest on the next bag read.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-sourcing-write:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    // `user`, not `session`: getUserSession returns the JWT CLAIMS as `session`,
    // where the id is `sub`. Reading `session.id` yields undefined and the
    // answer would be recorded as reviewed by nobody.
    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");
    if (!user) throw new APIError(403, "Admin access required");

    const { id } = await params;
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = answerSourcingRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    return successResponse(await answerSourcing(user.id, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
