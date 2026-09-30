import { NextRequest, NextResponse } from "next/server";
import { refreshCatalogLandedPrices } from "@/features/catalog/services/catalog-landed-price.service";
import { runCatalogScrapeJob } from "@/features/catalog/services/catalog-scrape.service";
import { runCronJob } from "@/lib/auth/cron";

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
  return runCronJob(request, "catalog-scrape", async () => {
    const summary = await runCatalogScrapeJob();
    // Price what the run just wrote (the upsert clears each row's stamp) and
    // anything older than the refresh window, so the shop's filters and sort
    // (migration 080) run on current figures. Arithmetic, no vendor call.
    // Its failure is reported, not thrown: the scrape itself already happened.
    const landed = await refreshCatalogLandedPrices().catch((error: unknown) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    return {
      landed,
      message: summary.skipped ? `Catalog scrape skipped: ${summary.skipped}` : "Catalog scrape run",
      ...summary,
    };
  });
}
