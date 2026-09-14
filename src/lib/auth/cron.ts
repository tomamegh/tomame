import { NextRequest, NextResponse } from "next/server";

import { recordJobRun, type JobRunOutcome } from "@/db/queries/job-heartbeats";
import { logger } from "@/lib/logger";

/**
 * The one gate for `/api/cron/*`.
 *
 * Every cron route used to carry its own copy of
 * `if (cronSecret && authHeader !== ...)`, which FAILS OPEN: on a deployment
 * where `CRON_SECRET` is unset, every job endpoint answers anyone. The jobs
 * spend vendor budget (ScraperAPI, Paystack verifies) and write to money tables,
 * so an unprovisioned secret must make them refuse, not comply. This helper
 * fails closed, and a 503 rather than a 401 so the operator can tell "not
 * configured" from "wrong caller" in the function log.
 *
 * Returns the response to send when the caller is refused, or null to proceed.
 */
export function authorizeCron(request: NextRequest, job: string): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("Cron endpoint refused: CRON_SECRET is not configured", { job });
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 503 });
  }

  const header = request.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    logger.warn("Cron endpoint unauthorized access attempt", { job });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Run one cron job: authorize, execute, record the heartbeat, answer.
 *
 * The heartbeat (060) is the part that matters. pg_cron can report "succeeded"
 * every minute while `net.http_get` never reaches this app; only the app knows
 * whether it ran, so the app writes the row and the operations screen alarms
 * on its absence. A heartbeat write failing must not fail the job, so it is
 * logged and swallowed.
 *
 * `handler` returns the run's summary. `success: false` in it (the exchange
 * rates job's partial failure) is answered 207 and recorded as a failed run; a
 * throw is a 500 and a failed run. Everything else is 200 and a success.
 */
export async function runCronJob(
  request: NextRequest,
  job: string,
  handler: () => Promise<Record<string, unknown>>,
): Promise<NextResponse> {
  const refused = authorizeCron(request, job);
  if (refused) return refused;

  const started = Date.now();
  try {
    const summary = await handler();
    const ok = summary.success !== false;
    await heartbeat(job, { ok, ranAt: new Date().toISOString(), durationMs: Date.now() - started, summary, error: ok ? undefined : String(summary.message ?? "partial failure") });
    return NextResponse.json({ success: ok, ...summary }, { status: ok ? 200 : 207 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`${job} cron job failed`, { error: message });
    await heartbeat(job, { ok: false, ranAt: new Date().toISOString(), durationMs: Date.now() - started, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function heartbeat(job: string, outcome: JobRunOutcome): Promise<void> {
  try {
    await recordJobRun(job, outcome);
  } catch (error) {
    logger.error("job heartbeat not recorded", { job, error: error instanceof Error ? error.message : String(error) });
  }
}
