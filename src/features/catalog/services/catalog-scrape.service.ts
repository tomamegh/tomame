import "server-only";
import { logger } from "@/lib/logger";
import { CATALOG_JOB } from "@/config/catalog";
import {
  claimNextDueQuery,
  getOrCreateBudget,
  incrementBudget,
  markQueryResult,
  upsertCatalogProducts,
  type CatalogStore,
} from "@/db/queries/catalog";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import { fetchCatalogSearch, isScraperApiConfigured } from "./scraperapi-search";

export interface CatalogScrapeSummary {
  query_id: string | null;
  store: CatalogStore | null;
  query: string | null;
  /** Vendor rows that mapped to a storable product. */
  fetched: number;
  upserted: number;
  budget_used: number;
  budget_cap: number;
  skipped?: "budget" | "no_due_query" | "vendor_unconfigured";
  /** Vendor failure message; the credit was still spent. */
  error?: string;
  deactivated?: boolean;
}

/** 'YYYY-MM' in UTC — the budget period. */
export function budgetPeriodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * One run = one search query = at most one vendor request. Built for pg_cron
 * firing it hourly: small, idempotent, and finished well inside the route's
 * 60 s ceiling. Never loops over queries.
 *
 *   budget check → claim query → vendor call → budget += 1 → upsert → stamp → audit
 *
 * The budget is incremented in a `finally` around the vendor call because a
 * failed call still costs a credit. A vendor failure never fails the run — it
 * is recorded on the query (deactivated after `maxConsecutiveFailures`) and
 * surfaces in the summary. A MISSING TABLE does fail the run: that is a
 * deploy-ordering bug and must be loud.
 */
export async function runCatalogScrapeJob(now: Date = new Date()): Promise<CatalogScrapeSummary> {
  const period = budgetPeriodOf(now);
  const budget = await getOrCreateBudget(CATALOG_JOB.jobName, period, CATALOG_JOB.defaultMonthlyCap);

  const summary: CatalogScrapeSummary = {
    query_id: null,
    store: null,
    query: null,
    fetched: 0,
    upserted: 0,
    budget_used: budget.used,
    budget_cap: budget.cap,
  };

  if (budget.used >= budget.cap) {
    summary.skipped = "budget";
    return finish(summary);
  }
  if (!isScraperApiConfigured()) {
    summary.skipped = "vendor_unconfigured";
    return finish(summary);
  }

  const claimed = await claimNextDueQuery(now.toISOString(), CATALOG_JOB.requeryAfterHours);
  if (!claimed) {
    summary.skipped = "no_due_query";
    return finish(summary);
  }
  summary.query_id = claimed.id;
  summary.store = claimed.store;
  summary.query = claimed.query;

  let items: Awaited<ReturnType<typeof fetchCatalogSearch>>["items"] | null = null;
  let vendorError: unknown = null;
  try {
    items = (await fetchCatalogSearch(claimed.store, claimed.query, { queryId: claimed.id, category: claimed.category })).items;
  } catch (error) {
    vendorError = error;
  } finally {
    const spent = await incrementBudget(CATALOG_JOB.jobName, period, 1, CATALOG_JOB.defaultMonthlyCap);
    summary.budget_used = spent.used;
    summary.budget_cap = spent.cap;
  }

  if (vendorError || !items) {
    const failures = claimed.consecutive_failures + 1;
    const deactivated = failures >= CATALOG_JOB.maxConsecutiveFailures;
    const message = vendorError instanceof Error ? vendorError.message : String(vendorError ?? "no items");
    logger.warn("catalog-scrape: vendor call failed", { queryId: claimed.id, store: claimed.store, failures, deactivated, error: message });
    await markQueryResult(claimed.id, { last_result_count: null, consecutive_failures: failures, is_active: !deactivated });
    summary.error = message.slice(0, 300);
    summary.deactivated = deactivated;
    return finish(summary);
  }

  summary.fetched = items.length;
  try {
    summary.upserted = await upsertCatalogProducts(items);
  } catch (error) {
    if (isSchemaMissingError(error)) throw error;
    // The credit is spent and the vendor answered; a write failure is ours, not the query's.
    const message = error instanceof Error ? error.message : String(error);
    logger.error("catalog-scrape: upsert failed", { queryId: claimed.id, error: message });
    summary.error = message.slice(0, 300);
  }
  await markQueryResult(claimed.id, { last_result_count: summary.fetched, consecutive_failures: 0, is_active: true });

  return finish(summary);
}

async function finish(summary: CatalogScrapeSummary): Promise<CatalogScrapeSummary> {
  await logAuditEvent({
    actorId: null,
    actorRole: "system",
    action: "catalog_scrape_run",
    entityType: "job",
    entityId: summary.query_id,
    metadata: { ...summary },
  });
  logger.info("catalog-scrape: done", { ...summary });
  return summary;
}
