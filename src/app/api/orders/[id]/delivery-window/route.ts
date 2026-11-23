import { NextRequest } from "next/server";
import { z } from "zod";

import { setDeliveryWindowPref } from "@/features/order-delivery/services/delivery-change.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const bodySchema = z.object({ slot: z.string().trim().min(1).max(40).nullable() }).strict();

/** `POST /api/orders/:id/delivery-window` — the customer's preferred delivery window, before the flight (125). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(await getAuthenticatedUser());
    if (!(await checkRateLimit(`order-delivery:${auth.id}`, RATE_LIMIT.general)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(400, "Choose a delivery window.");
    const { id } = await params;
    return successResponse(await setDeliveryWindowPref(auth, id, parsed.data.slot));
  } catch (error) {
    return errorResponse(error);
  }
}
