import { NextRequest } from "next/server";
import { waitlistSignupSchema } from "@/features/marketing/schema";
import { joinWaitlist } from "@/features/marketing/services/waitlist.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * POST /api/waitlist
 * Join the waitlist for a lane that is not open yet (UK, China).
 *
 * Public: no account needed. If the visitor happens to be signed in, the
 * signup is linked to them. Abuse is bounded by the per-IP rate limit and the
 * `UNIQUE (email, region_code)` constraint, which makes a repeat signup a
 * no-op rather than a new row.
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = waitlistSignupSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`waitlist:${ip}`, RATE_LIMIT.waitlist).allowed) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const user = await getAuthenticatedUser();

    const result = await joinWaitlist({
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      regionCode: parsed.data.region_code,
      userId: user?.id ?? null,
    });

    return successResponse(result, result.status === "joined" ? 201 : 200);
  } catch (error) {
    return errorResponse(error);
  }
}
