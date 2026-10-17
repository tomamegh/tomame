import { NextRequest, NextResponse } from "next/server";

import { runDailySummary } from "@/features/ops/ops-notify.service";
import { runCronJob } from "@/lib/auth/cron";

export const maxDuration = 60;

/**
 * The 07:00 health summary (07:00 UTC is 07:00 in Accra). Called by pg_cron
 * every hour (migration 095): before 07:00 it answers "not due yet", the first
 * call from 07:00 that sends claims the day, and the rest answer "already
 * sent". A morning lost to an outage goes out at the next healthy hour.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return runCronJob(request, "ops-daily-summary", () => runDailySummary());
}
