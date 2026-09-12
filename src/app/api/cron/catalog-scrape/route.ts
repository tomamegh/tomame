import { NextRequest, NextResponse } from "next/server";
import { runCatalogScrapeJob } from "@/features/catalog/services/catalog-scrape.service";
import { logger } from "@/lib/logger";

/** One vendor call per run; eBay search measured at 25 s live. */
export const maxDuration = 60;

/**
 * Hourly catalogue scrape. Called by pg_cron via pg_net at :05 (migration 045),
 * authenticated exactly like `/api/cron/price-watches`: a bearer `CRON_SECRET`
 * already provisioned in Terraform — no new environment variable.
 *
 * The job absorbs vendor failures (they land in `error` / the query's failure
 * streak) and budget exhaustion (`skipped: 'budget'`), so those return 200 with
 * a summary. What reaches this catch is a genuinely broken run — a missing
 * table, an unreachable database — and that is a 500 so it is visible.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    logger.warn("Cron endpoint unauthorized access attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    logger.info("Starting catalog-scrape cron job");

    const summary = await runCatalogScrapeJob();

    return NextResponse.json({
      success: true,
      message: summary.skipped ? `Catalog scrape skipped: ${summary.skipped}` : "Catalog scrape run",
      ...summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Catalog-scrape cron job failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
