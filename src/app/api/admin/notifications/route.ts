import type { NextRequest } from "next/server";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import {
  getAdminNotificationCounts,
  listNotificationsForAdmin,
  type AdminNotificationChannel,
  type AdminNotificationStatus,
} from "@/db/queries/admin-notifications";

/**
 * The admin delivery log, for the header bell.
 *
 * WHAT CHANGED AND WHY. This route used to call `listAllNotifications`, which
 * selects `profiles(id, email, first_name, last_name)` — and `profiles` has no
 * `email` column (migration 001 never created one; the address lives in
 * `auth.users`). PostgREST answers 42703, the service logs the error and
 * returns an empty array, and so this endpoint has been answering
 * `{ notifications: [], count: 0 }` on every environment no matter what the
 * table contained. The bell was permanently empty and looked like good news.
 *
 * It now reads through `db/queries/admin-notifications`, which joins the
 * recipient's NAME and leaves the address to the one place that holds it.
 *
 * The response keeps the `{ notifications, count }` shape the bell already
 * consumes. `count` is now the TOTAL in the table rather than the length of the
 * returned page — the page is capped, and a bell that said "100" forever would
 * be furniture.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-notifications:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const { searchParams } = request.nextUrl;
    const status = parseStatus(searchParams.get("status"));
    const channel = parseChannel(searchParams.get("channel"));
    const event = searchParams.get("event") ?? undefined;
    const userId = searchParams.get("userId") ?? undefined;
    const limit = parseLimit(searchParams.get("limit"));

    const [notifications, counts] = await Promise.all([
      listNotificationsForAdmin({ status, channel, event, userId }, limit),
      getAdminNotificationCounts(),
    ]);

    return successResponse({
      notifications,
      /** Total rows in the table, not the size of this page. */
      count: counts.total,
      counts,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function parseStatus(value: string | null): AdminNotificationStatus | undefined {
  return value === "sent" || value === "pending" || value === "failed" ? value : undefined;
}

function parseChannel(value: string | null): AdminNotificationChannel | undefined {
  return value === "email" || value === "whatsapp" ? value : undefined;
}

/** Clamped rather than rejected: a silly `?limit=` is not worth a 400. */
function parseLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}
