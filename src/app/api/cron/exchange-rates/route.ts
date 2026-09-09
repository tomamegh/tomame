import { NextRequest, NextResponse } from "next/server";
import { fetchAndStoreRates } from "@/lib/exchange-rates";
import { logger } from "@/lib/logger";

/**
 * Cron endpoint to fetch and store exchange rates.
 * Called by pg_cron via pg_net every 4 hours.
 * Protected by CRON_SECRET bearer token.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    logger.warn("Cron endpoint unauthorized access attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    logger.info("Starting exchange rates cron job");

    const result = await fetchAndStoreRates();

    if (result.success) {
      logger.info("Exchange rates cron job completed", { updated: result.updated });
      return NextResponse.json({
        success: true,
        message: "Exchange rates updated",
        updated: result.updated,
      });
    } else {
      logger.error("Exchange rates cron job had errors", { errors: result.errors });
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
