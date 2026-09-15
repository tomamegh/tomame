import { NextRequest } from "next/server";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { answerCarEnquirySchema, carIdSchema } from "@/features/cars/schema";
import { answerEnquiry } from "@/features/cars/services/cars.service";

/**
 * Answer one enquiry: give a price, counter an offer, accept it or decline it
 * (migration 067).
 *
 * ACCEPTING TAKES NO MONEY. It records that a human said yes, so the buyer can
 * pick the conversation up off-platform; there is no `orders` row, no payment
 * and no state machine behind it. Buying a car is a later phase pending a
 * product decision — the service and the migration header both say so at
 * length, and this route is the place somebody would be most tempted to wire a
 * checkout into.
 *
 * Auth, rate limit, validation and status codes only. Which transitions are
 * legal from the row's current state — and the 409 when two admins work the same
 * enquiry — belong to `features/cars/services/cars.service`, because that needs
 * to read the row.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ enquiryId: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-car-enquiries:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const { enquiryId } = await params;
    const id = carIdSchema.safeParse(enquiryId);
    // A malformed id is a 404, not a 400: "that is not an enquiry" is the same
    // answer either way, and telling the two apart is not the caller's business.
    if (!id.success) throw new APIError(404, "Enquiry not found");

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = answerCarEnquirySchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const enquiry = await answerEnquiry(
      { id: admin.id, email: admin.email ?? null },
      id.data,
      parsed.data,
    );

    return successResponse(enquiry);
  } catch (error) {
    return errorResponse(error);
  }
}
