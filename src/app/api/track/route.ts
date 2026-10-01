import { NextRequest } from "next/server";
import { z } from "zod";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { lookupPublicTracking } from "@/features/tracking/services/public-tracking.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

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
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`track:${ip}`, RATE_LIMIT.track)).allowed) {
      throw new APIError(429, "Too many lookups. Try again in a few minutes.");
    }
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, "Enter a Tomame reference or a tracking number");

    const user = await getAuthenticatedUser().catch(() => null);
    const result = await lookupPublicTracking({
      query: parsed.data.q,
      verifier: parsed.data.verify ?? null,
      viewerId: user?.id ?? null,
      ip,
    });
    const response = successResponse(result);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
