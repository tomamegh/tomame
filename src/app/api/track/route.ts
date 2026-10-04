import { NextRequest } from "next/server";
import { z } from "zod";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { lookupPublicTracking } from "@/features/tracking/services/public-tracking.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp, rateLimitSubject } from "@/lib/rate-limit";

const bodySchema = z.object({
  q: z.string().max(120),
  verify: z.string().max(254).optional().nullable(),
});

/**
 * POST /api/track (086) — public shipment lookup by Tomame reference or a
 * tracking number. No login. POST, not GET, so the second factor (an email or
 * phone digits) never lands in a URL, a log line or a browser history.
 *
 * Every miss is the same `{ found: false }` with a 200, so the response does
 * not say whether a reference exists, was malformed, or was ambiguous.
 */
export async function POST(request: NextRequest) {
  try {
    // A failed session read throws (a 500), like every other route: answering
    // it as a stranger would hide an outage behind "confirm it is yours".
    const user = await getAuthenticatedUser();
    // Keyed per user when signed in, so owners behind one carrier NAT do not
    // share a budget; per IP otherwise.
    if (!(await checkRateLimit(`track:${rateLimitSubject(request, user?.id)}`, RATE_LIMIT.track)).allowed) {
      throw new APIError(429, "Too many lookups. Try again in a few minutes.");
    }
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, "Enter a Tomame reference or a tracking number");

    const result = await lookupPublicTracking({
      query: parsed.data.q,
      verifier: parsed.data.verify ?? null,
      viewerId: user?.id ?? null,
      ip: getClientIp(request),
    });
    const response = successResponse(result);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
