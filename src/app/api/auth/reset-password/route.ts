import { NextRequest } from "next/server";
import { resetPasswordSchema } from "@/features/auth/auth.validators";
import { resetPassword, getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`reset-password:${ip}`, RATE_LIMIT.auth).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const body: unknown = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!auth.ok) throw new APIError(auth.status, auth.error);

    const data = await resetPassword(auth.user.id, parsed.data.password);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
