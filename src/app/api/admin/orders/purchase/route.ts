import { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { purchaseOrdersSchema } from "@/features/orders/schema";
import { markOrdersPurchased } from "@/features/orders/services/order-purchase.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/admin/orders/purchase — "Mark as purchased" for several orders of
 * one checkout at once. Each order is moved on its own; the response lists the
 * ones that moved and the ones refused, with the reason.
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await checkRateLimit(`admin-orders:${getClientIp(request)}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = purchaseOrdersSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    const admin = requireAdmin(requireAuth(await getAuthenticatedUser()));
    const { order_ids, ...input } = parsed.data;
    const result = await markOrdersPurchased(admin, order_ids, input);
    if (result.purchased.length === 0) throw new APIError(409, result.refused[0]?.reason ?? "No order could be marked purchased");
    return successResponse({
      purchased: result.purchased.map((o) => o.id),
      refused: result.refused,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
