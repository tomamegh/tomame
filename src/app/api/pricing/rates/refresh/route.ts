import { NextRequest, NextResponse } from "next/server";
import {
  exchangeRateApiProvider,
  fetchAndStoreRates,
} from "@/lib/exchange-rates";
import { logger } from "@/lib/logger";
import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services";
import { APIError } from "@/lib/auth/api-helpers";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-deliveries:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const result = await fetchAndStoreRates(exchangeRateApiProvider);

    if (result.success) {
      logger.info("Exchange rates cron job completed", {
        updated: result.updated,
      });
      return NextResponse.json({
        success: true,
        message: "Exchange rates updated",
        updated: result.updated,
      });
    } else {
      logger.error("Exchange rates cron job had errors", {
        errors: result.errors,
      });
      return NextResponse.json(
        {
          success: false,
          message: "Some rates failed to update",
          updated: result.updated,
          errors: result.errors,
        },
        { status: 207 },
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Exchange rates cron job failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
