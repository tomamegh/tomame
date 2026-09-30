import { NextRequest, NextResponse } from "next/server";

import { runOpsAlerts } from "@/features/ops/ops-notify.service";
import { runCronJob } from "@/lib/auth/cron";

/** A handful of counts and at most one email per recipient. */
export const maxDuration = 60;

/**
 * Platform alerts. Called by pg_cron via pg_net every five minutes (migration
 * 083) with the bearer CRON_SECRET. Reads what went wrong since the last run,
 * throttles it (one email per alert an hour, a digest when there are several,
 * a cap per hour) and emails `ops_alert_recipients`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return runCronJob(request, "ops-alerts", () => runOpsAlerts());
}
