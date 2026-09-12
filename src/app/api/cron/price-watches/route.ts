import { NextRequest, NextResponse } from "next/server";
import { runPriceWatchJob } from "@/features/watches/services/watches.service";
import { logger } from "@/lib/logger";

/**
 * Nightly price-watch re-check. Called by pg_cron via pg_net at 06:00 UTC
 * (migration 042), authenticated exactly like `/api/cron/exchange-rates`:
 * a bearer `CRON_SECRET`, which is already provisioned in Terraform. No new
 * environment variable is introduced here on purpose — an unprovisioned
 * `process.env` read fails `src/lib/__tests__/env-provisioning.test.ts`.
 *
 * The job itself absorbs per-watch failures (see `runPriceWatchJob`), so a dead
 * link shows up in `failed`, not in the status code. What does reach this catch
 * is a genuinely broken run — a missing table, an unreachable database — and
 * that is reported as a 500 so the failure is visible rather than a cheerful
 * summary of zero.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    logger.warn("Cron endpoint unauthorized access attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    logger.info("Starting price-watch cron job");

    const summary = await runPriceWatchJob();

    return NextResponse.json({
      success: true,
      message: "Price watches re-checked",
      ...summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Price-watch cron job failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
