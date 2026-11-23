import { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { emailCodeRequestSchema } from "@/features/auth/schema";
import { sendEmailSignInCode } from "@/features/auth/services/email-code.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/** POST /api/auth/email-code: email a sign-in code (creates the account on first use). */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`email-code:${ip}`, RATE_LIMIT.auth)).allowed) {
      throw new APIError(429, "Too many requests. Please wait a few minutes and try again.");
    }
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = emailCodeRequestSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    // Per address too, so one inbox cannot be flooded from many networks.
    if (!(await checkRateLimit(`email-code-send:${parsed.data.email}`, RATE_LIMIT.emailCodeSend)).allowed) {
      throw new APIError(429, "We've sent a few codes already. Use the newest one, or try again in a few minutes.");
    }

    return successResponse(await sendEmailSignInCode(parsed.data.email));
  } catch (error) {
    return errorResponse(error);
  }
}
