import { NextRequest } from "next/server";
import { z } from "zod";

import { rebookDelivery } from "@/features/order-delivery/services/rider-rebook.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const bodySchema = z.object({ start: z.iso.datetime({ offset: true }) }).strict();

/** `POST /api/orders/:id/rebook` — the customer missed the rider and picks the next window (126). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(await getAuthenticatedUser());
    if (!(await checkRateLimit(`order-delivery:${auth.id}`, RATE_LIMIT.general)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(400, "Pick a window.");
    const { id } = await params;
    return successResponse(await rebookDelivery(auth, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
