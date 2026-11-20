import type { NextRequest } from "next/server";
import * as z from "zod";

import { RATE_LIMIT } from "@/config/security";
import { canAccessAdmin, getUserSession } from "@/features/auth/services/auth.service";
import { recordManualWhatsAppSend } from "@/features/notifications/services/manual-whatsapp.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const bodySchema = z.object({ stage: z.string().min(1).max(40) });

/**
 * `POST /api/admin/orders/:id/whatsapp-sent` — staff record that they sent a
 * stage's WhatsApp by hand (Phase 1, migration 104). HTTP orchestration only;
 * which stages count, the one-tick rule and the audit row live in the service.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`admin-whatsapp-sent:${ip}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session) || !user) throw new APIError(403, "Admin access required");

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new APIError(404, "Order not found");
    return successResponse(await recordManualWhatsAppSend(user, id, parsed.data.stage));
  } catch (error) {
    return errorResponse(error);
  }
}
