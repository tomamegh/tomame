import { NextRequest, NextResponse } from "next/server";
import { fetchAndStoreRates } from "@/lib/exchange-rates";
import { runCronJob } from "@/lib/auth/cron";

/**
 * Cron endpoint to fetch and store exchange rates. Called by pg_cron via pg_net
 * every 4 hours (migration 026). Authorized and heartbeat-recorded by
 * `runCronJob`, like every other job.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return runCronJob(request, "fetch-exchange-rates", async () => {
    const result = await fetchAndStoreRates();
    // `success: false` is answered 207 and recorded as a failed run by runCronJob.
    return result.success
      ? { message: "Exchange rates updated", updated: result.updated }
      : { success: false, message: "Some rates failed to update", updated: result.updated, errors: result.errors };
  });
}
