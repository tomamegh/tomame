import { NextRequest, NextResponse } from "next/server";
import { runPriceWatchJob } from "@/features/watches/services/watches.service";
import { runCronJob } from "@/lib/auth/cron";

/**
 * One batch of the price-watch re-check (8 watches, 4 at a time). Two waves of
 * a 25 s vendor budget, so this sits well inside the cap rather than near it —
 * the ceiling exists for the pathological run, not the normal one.
 */
export const maxDuration = 300;

/**
 * Price-watch re-check batch. Called by pg_cron via pg_net every ten minutes
 * (migration 052 — it was a single 06:00 sweep under 042), authenticated
 * exactly like `/api/cron/exchange-rates`: a bearer `CRON_SECRET`, which is
 * already provisioned in Terraform. No new environment variable is introduced
 * here on purpose — an unprovisioned `process.env` read fails
 * `src/lib/__tests__/env-provisioning.test.ts`.
 *
 * Most invocations claim nothing and return in milliseconds: a watch checked
 * inside `PRICE_WATCH_JOB.recheckAfterHours` is not due, so the ten-minute
 * schedule buys resumability, not extra scraper spend.
 *
 * The job itself absorbs per-watch failures and failed price-drop alerts (see
 * `runPriceWatchJob`), so a dead link shows up in `failed`, not in the status
 * code. What does reach this catch is a genuinely broken run — a missing table,
 * an unreachable database — and that is reported as a 500 so the failure is
 * visible rather than a cheerful summary of zero.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return runCronJob(request, "recheck-price-watches", async () => {
    const summary = await runPriceWatchJob();
    return { ...summary };
  });
}
