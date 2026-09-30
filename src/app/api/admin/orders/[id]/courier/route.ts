import type { NextRequest } from "next/server";

import { canAccessAdmin, getUserSession } from "@/features/auth/services/auth.service";
import { courierHandoffSchema } from "@/features/order-delivery/schema";
import { dispatchOrderCourier } from "@/features/order-delivery/services/courier.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * `POST /api/admin/orders/:id/courier` — record the rider (or ride-hailing
 * link) carrying an in-transit order and tell the customer (migration 075).
 *
 * HTTP orchestration only: rate limit, admin session, body validation. Which
 * orders may have a rider, what counts as a re-send and what is audited live in
 * `courier.service.ts`. The provider is derived from the link by the schema; it
 * is never read from the body.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-order-courier:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = courierHandoffSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { id } = await params;
    const result = await dispatchOrderCourier(user, id, parsed.data);
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
