import { NextRequest, NextResponse } from "next/server";
import { runCatalogEnrichJob } from "@/features/catalog/services/catalog-enrich.service";
import { runCronJob } from "@/lib/auth/cron";

/** One product-details call per run (12 to 22 s vendor timeouts). */
export const maxDuration = 60;

/**
 * Catalogue weight enrichment, every 10 minutes from pg_cron (migration 084),
 * behind the same bearer `CRON_SECRET` as every other cron route. Budget
 * exhaustion and "nothing due" are 200s with a summary; a broken run is a 500.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return runCronJob(request, "catalog-enrich", async () => {
    const summary = await runCatalogEnrichJob();
    return { message: summary.skipped ? `Catalog enrichment skipped: ${summary.skipped}` : "Catalog enrichment run", ...summary };
  });
}
