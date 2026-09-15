import { NextRequest } from "next/server";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { adminCarEnquiryQuerySchema } from "@/features/cars/schema";
import { listCarEnquiriesForAdmin } from "@/features/cars/services/cars.service";

/**
 * The enquiry queue: who has asked what about which car (migration 067).
 *
 * WHY THIS SITS UNDER `/cars/` NEXT TO `[id]`. Next resolves a static segment
 * before a dynamic one, so `/api/admin/cars/enquiries` reaches this file and
 * never `[id]/route.ts` — and even if it did, `carIdSchema` refuses anything
 * that is not a UUID, so "enquiries" could not be read as a listing id. Keeping
 * it here means the whole feature is one directory rather than two that have to
 * be found separately.
 *
 * Every open row is a named person waiting: someone who wants to know what a car
 * costs, or who has made an offer nobody has answered. That is what the sidebar
 * badge counts (`carEnquiriesOpen`), and the default sort is newest first so a
 * fresh offer is at the top of the screen it appears on.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-car-enquiries-read:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const parsed = adminCarEnquiryQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { enquiries, total } = await listCarEnquiriesForAdmin({
      status: parsed.data.status,
      carListingId: parsed.data.car_listing_id,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });

    return successResponse({ enquiries, total });
  } catch (error) {
    return errorResponse(error);
  }
}
