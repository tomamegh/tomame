import { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { emailCodeVerifySchema } from "@/features/auth/schema";
import { verifyEmailSignInCode } from "@/features/auth/services/email-code.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/** POST /api/auth/email-code/verify: trade the emailed code for a session (cookies). */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`email-code-verify:${ip}`, RATE_LIMIT.auth)).allowed) {
      throw new APIError(429, "Too many tries. Please wait a few minutes and try again.");
    }
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = emailCodeVerifySchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    // Guesses are capped per address as well as per network.
    if (!(await checkRateLimit(`email-code-verify:${parsed.data.email}`, RATE_LIMIT.emailCodeVerify)).allowed) {
      throw new APIError(429, "Too many wrong codes. Ask for a new code in a few minutes.");
    }

    return successResponse(await verifyEmailSignInCode(parsed.data.email, parsed.data.code));
  } catch (error) {
    return errorResponse(error);
  }
}
