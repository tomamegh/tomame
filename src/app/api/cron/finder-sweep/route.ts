import { NextRequest, NextResponse } from "next/server";

import { sweepFinderRuns } from "@/features/finder/services/finder-run.service";
import { runCronJob } from "@/lib/auth/cron";
import { logger } from "@/lib/logger";

/** Two runs per sweep, each stopped at FINDER.deadlineMs (100 s): inside Vercel's 300 s. */
export const maxDuration = 300;

/**
 * The price finder's safety net (migration 105), called every minute by
 * pg_cron through pg_net with `Bearer CRON_SECRET`.
 *
 * NOT the engine: `POST /api/finder` starts every run with `after()`. This
 * re-drives the ones a deploy, crash or timeout dropped, and closes the ones
 * out of tries. A healthy minute finds nothing.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  return runCronJob(request, "finder-sweep", async () => {
    const summary = await sweepFinderRuns();
    if (summary.ran || summary.reclaimed) logger.info("finder-sweep run", { ...summary });
    return { ...summary };
  });
}

export const POST = handle;
export const GET = handle;
