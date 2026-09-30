import { NextRequest, NextResponse } from "next/server";
import { runCatalogCleanupJob } from "@/features/catalog/services/catalog-cleanup.service";
import { runCronJob } from "@/lib/auth/cron";

export const maxDuration = 60;

/**
 * Daily catalogue clean-up (migration 084): one batch of deletions per run, no
 * vendor calls, behind the bearer `CRON_SECRET`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return runCronJob(request, "catalog-cleanup", async () => {
    const summary = await runCatalogCleanupJob();
    return { message: "Catalog clean-up run", ...summary };
  });
}
