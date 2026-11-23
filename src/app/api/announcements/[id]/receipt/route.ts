import type { NextRequest } from "next/server";
import { z } from "zod";

import { recordAnnouncementReceipt } from "@/features/announcements/services/announcements.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ dismissed: z.boolean().default(false) });

/** POST /api/announcements/:id/receipt — the pop-up was shown, or the customer dismissed the message. */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    if (!(await checkRateLimit(`announcement-receipt:${getClientIp(request)}`, RATE_LIMIT.general)).allowed) throw new APIError(429, "Too many requests");
    const auth = requireAuth(await getAuthenticatedUser());
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new APIError(400, "Unknown message");
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new APIError(400, "Invalid request");
    await recordAnnouncementReceipt(auth.id, id, parsed.data.dismissed);
    return successResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
