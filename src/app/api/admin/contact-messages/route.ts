import { NextRequest } from "next/server";

import { listContactMessages, type ContactMessageStatus } from "@/db/queries/contact-messages";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const STATUSES = ["open", "answered", "closed"] as const;

/** GET /api/admin/contact-messages?status=open — oldest first; someone is waiting on each. */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-contact:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const raw = request.nextUrl.searchParams.get("status");
    const status = STATUSES.find((s) => s === raw) as ContactMessageStatus | undefined;

    return successResponse(await listContactMessages(status));
  } catch (error) {
    return errorResponse(error);
  }
}
