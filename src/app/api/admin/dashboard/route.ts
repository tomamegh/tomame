import { NextRequest } from "next/server";

import { getAdminDashboard } from "@/features/admin/admin.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * GET /api/admin/dashboard — the admin overview figures, as JSON.
 *
 * THIS ROUTE HAD NO AUTHORIZATION AT ALL and answered anyone on the internet
 * with the business's order count, revenue and customer count, from a
 * SERVICE-ROLE client. Verified live against both hosted projects on
 * 2026-09-13 with no credentials of any kind.
 *
 * It was not an oversight in one file so much as a wrong assumption about the
 * gate: `src/lib/supabase/proxy.ts` protects `adminRoutes = ["/admin"]`, and
 * `/api/admin/dashboard` does not start with `/admin` — it starts with `/api`.
 * Every other admin route happened to carry its own check, so nothing else was
 * exposed. The proxy now covers the `/api/admin` prefix too, so a future route
 * that forgets this check fails closed; the check stays here as well, because
 * defence in depth is the whole point and a route must not rely on chrome.
 *
 * `/admin` itself no longer calls this — it is a server component that reads
 * `getAdminDashboard()` in the same pass it renders. The route stays because the
 * same figures are worth having as JSON (a status page, a scripted check), and
 * because deleting it would delete the check above with it. The service role
 * client is now created inside `db/queries/admin-dashboard.ts` rather than being
 * handed in here: a route handler's job is auth, validation and status codes,
 * not choosing a database client (CLAUDE.md).
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-dashboard:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    // Same spelling as `/api/admin/contact-messages`: the role comes from the
    // JWT claim `custom_access_token_hook` sets, so this costs no round trip.
    const { session } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    return successResponse(await getAdminDashboard());
  } catch (error) {
    return errorResponse(error);
  }
}
