import { NextRequest } from "next/server";
import { forgotPasswordSchema } from "@/features/auth/auth.validators";
import { forgotPassword } from "@/features/auth/services/auth.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`forgot-password:${ip}`, RATE_LIMIT.auth).allowed) {
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
