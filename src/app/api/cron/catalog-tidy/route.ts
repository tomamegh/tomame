import { NextRequest, NextResponse } from "next/server";
import { runCatalogTidyJob } from "@/features/catalog/services/catalog-tidy.service";
import { runCronJob } from "@/lib/auth/cron";

export const maxDuration = 60;

/**
 * Catalogue tidy (migration 116, site brief Fix 4): one batch of re-titling and
 * re-filing plus one round of de-duplication per run, no vendor calls, behind
 * the bearer `CRON_SECRET`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return runCronJob(request, "catalog-tidy", async () => {
    const summary = await runCatalogTidyJob();
    return { message: "Catalog tidy run", ...summary };
  });
}
