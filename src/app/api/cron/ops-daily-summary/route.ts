import { NextRequest, NextResponse } from "next/server";

import { runDailySummary } from "@/features/ops/ops-notify.service";
import { runCronJob } from "@/lib/auth/cron";

export const maxDuration = 60;

/**
 * The 07:00 health summary (07:00 UTC is 07:00 in Accra). Called by pg_cron
 * four times in that hour (migration 083); the first call that sends claims
 * the day, so the rest answer "already sent".
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return runCronJob(request, "ops-daily-summary", () => runDailySummary());
}
