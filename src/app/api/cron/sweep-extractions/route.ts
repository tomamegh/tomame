import { NextRequest, NextResponse } from "next/server";
import { sweepExtractions } from "@/features/extraction/services/extraction-queue.service";
import { runCronJob } from "@/lib/auth/cron";
import { logger } from "@/lib/logger";

/**
 * Three jobs per run, each a vendor race with a 25 s budget, run one at a time.
 * Well inside Vercel Pro's 300 s cap even when every one of them times out.
 */
export const maxDuration = 300;

/**
 * The paste-queue safety net. Called by pg_cron via pg_net every minute
 * (migration 049), authenticated with the same bearer `CRON_SECRET` as the other
 * three jobs — no new environment variable.
 *
 * This is NOT the engine. `POST /api/pastes` starts every job in its own
 * invocation with `after()`; this exists for the ones that were dropped
 * mid-flight — a deploy, a crash, a function timeout — which is the only failure
 * `after()` cannot cover. On a healthy minute it finds nothing and says so.
 *
 * A job that fails is the job's own business (it records its reason and either
 * retries or offers the customer the describe-it form), so a run with failures in
 * it is still a 200. What reaches this catch is a broken run — a missing table, an
 * unreachable database — and that is a 500 so it is visible.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return runCronJob(request, "sweep-extractions", async () => {
    const summary = await sweepExtractions();
    // Only worth a line when it actually did something — this runs 1,440 times a day.
    if (summary.claimed || summary.reclaimed) {
      logger.info("sweep-extractions run", { ...summary });
    }
    return { ...summary };
  });
}
