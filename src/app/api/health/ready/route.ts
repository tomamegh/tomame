import { NextResponse } from "next/server";

import { checkReadiness } from "@/features/ops/health.service";

export const dynamic = "force-dynamic";

/**
 * @swagger
 * /api/health/ready:
 *   get:
 *     tags: [Health]
 *     summary: Readiness check (database included)
 *     description: One small database read through the same gateway the pages use, with a 5 s timeout. Watched by the uptime workflow.
 *     responses:
 *       200:
 *         description: The app can read from the database
 *       503:
 *         description: The database read failed or timed out
 */
export async function GET() {
  const readiness = await checkReadiness();
  // Public route: the database's own error text stays out of the body.
  const { ok, ms } = readiness.database;
  return NextResponse.json(
    { status: readiness.ok ? "ok" : "unavailable", database: { ok, ms }, timestamp: new Date().toISOString() },
    { status: readiness.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
