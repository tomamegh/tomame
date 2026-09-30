import "server-only";
import { logger } from "@/lib/logger";
import { CATALOG_CLEANUP, CATALOG_ENRICH, CATALOG_ROW_SANITY } from "@/config/catalog";
import { deleteCatalogProducts, listCatalogCleanupCandidates } from "@/db/queries/catalog";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { cleanupReasonFor, type CleanupReason, type CleanupRules } from "./catalog-cleanup";
import { configuredEnrichVendors, enrichableStores } from "./catalog-enrich.service";

export interface CatalogCleanupSummary {
  considered: number;
  deleted: number;
  /** Would have been deleted, but a bag, order or price watch holds the product. */
  skipped_referenced: number;
  /** Chosen for deletion, but referenced by the time the delete ran. */
  kept_at_delete: number;
  by_reason: Partial<Record<CleanupReason, number>>;
}

/**
 * The daily clean-up (084): one batch of at most `CATALOG_CLEANUP.batchSize`
 * candidates per run, no vendor calls. Idempotent: a second run over the same
 * rows finds them gone, or finds them kept for the same reason.
 */
export async function runCatalogCleanupJob(now: Date = new Date()): Promise<CatalogCleanupSummary> {
  const rules: CleanupRules = {
    now,
    staleAfterDays: CATALOG_CLEANUP.staleAfterDays,
    unpricedGraceHours: CATALOG_CLEANUP.unpricedGraceHours,
    maxEnrichAttempts: CATALOG_ENRICH.maxAttempts,
    enrichableStores: enrichableStores(configuredEnrichVendors()),
    maxPlausiblePriceUsd: CATALOG_ROW_SANITY.maxPlausiblePriceUsd,
    maxEbayTitleChars: CATALOG_ROW_SANITY.maxEbayTitleChars,
  };
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

  const candidates = await listCatalogCleanupCandidates({
    seenBeforeIso: hoursAgo(rules.staleAfterDays * 24),
    graceBeforeIso: hoursAgo(rules.unpricedGraceHours),
    maxAttempts: rules.maxEnrichAttempts,
    enrichableStores: rules.enrichableStores,
    maxPlausiblePriceUsd: rules.maxPlausiblePriceUsd,
    maxEbayTitleChars: rules.maxEbayTitleChars,
    limit: CATALOG_CLEANUP.batchSize,
  });

  const summary: CatalogCleanupSummary = { considered: candidates.length, deleted: 0, skipped_referenced: 0, kept_at_delete: 0, by_reason: {} };
  const doomed: string[] = [];
  const referencedSample: string[] = [];
  const reasonOf = new Map<string, CleanupReason>();

  for (const row of candidates) {
    const reason = cleanupReasonFor(row, rules);
    if (!reason) continue;
    if (row.referenced) {
      summary.skipped_referenced += 1;
      if (referencedSample.length < 5) referencedSample.push(row.id);
      continue;
    }
    doomed.push(row.id);
    reasonOf.set(row.id, reason);
  }

  if (summary.skipped_referenced > 0) {
    logger.info("catalog-cleanup: kept rows a customer still holds", { count: summary.skipped_referenced, sample: referencedSample });
  }

  const deleted = await deleteCatalogProducts(doomed);
  summary.deleted = deleted.length;
  summary.kept_at_delete = doomed.length - deleted.length;
  for (const id of deleted) {
    const reason = reasonOf.get(id);
    if (reason) summary.by_reason[reason] = (summary.by_reason[reason] ?? 0) + 1;
  }

  await logAuditEvent({
    actorId: null,
    actorRole: "system",
    action: "catalog_cleanup_run",
    entityType: "job",
    entityId: null,
    metadata: { ...summary },
  });
  logger.info("catalog-cleanup: done", { ...summary });
  return summary;
}
