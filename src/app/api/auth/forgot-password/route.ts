import { NextRequest } from "next/server";
import { forgotPasswordSchema } from "@/features/auth/schema";
import { forgotPassword } from "@/features/auth/services/auth.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`forgot-password:${ip}`, RATE_LIMIT.auth)).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const body: unknown = await request.json().catch(() => { throw new APIError(400, "Invalid JSON"); });
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const data = await forgotPassword(parsed.data.email);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
