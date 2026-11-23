import { NextRequest } from "next/server";
import { z } from "zod";

import { changeOrderDelivery } from "@/features/order-delivery/services/delivery-change.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const bodySchema = z.union([
  z.object({ delivery_address_id: z.string().uuid() }).strict(),
  z.object({ delivery_zone_id: z.string().uuid() }).strict(),
]);

/** `POST /api/orders/:id/delivery` — the customer changes where a paid checkout goes, before its flight (Initiative 5). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(await getAuthenticatedUser());
    if (!(await checkRateLimit(`order-delivery:${auth.id}`, RATE_LIMIT.general)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(400, "Choose an address or a pickup point.");
    const { id } = await params;
    return successResponse(await changeOrderDelivery(auth, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
