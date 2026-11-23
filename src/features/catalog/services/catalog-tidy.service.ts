import "server-only";

import {
  deleteCatalogProducts,
  listCatalogRowsToTidy,
  listCatalogTitleDuplicates,
  setCatalogDedupeNotes,
  setCatalogTidy,
  type CatalogDuplicateRow,
  type CatalogProductInput,
} from "@/db/queries/catalog";
import type { CatalogStore } from "@/config/catalog";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { logger } from "@/lib/logger";

import { departmentFor, displayTitle, pickKeeper, titleKey } from "../catalog-tidy";

/**
 * Site brief, Fix 4: the catalogue's rules (catalog-tidy.ts) applied at source,
 * on every scrape write, and by this job to rows written before 116.
 *
 * Bump CATALOG_TIDY_VERSION when a rule changes: the job then works through
 * every row again.
 */
export const CATALOG_TIDY_VERSION = 1;

export const CATALOG_TIDY = {
  /** Rows re-filed and re-titled per run (pure work and one bulk write). */
  batch: 2000,
  /** Duplicate sets resolved per run. */
  dedupeGroups: 300,
} as const;

const STORE_NAME: Record<CatalogStore, string> = { amazon: "Amazon", ebay: "eBay", walmart: "Walmart", etsy: "Etsy", nike: "Nike" };

/** A scraped row with its display title, identity key and department from its own title. */
export function tidyCatalogInput(row: CatalogProductInput): CatalogProductInput {
  const title = displayTitle(row.title) || row.title;
  return { ...row, title, title_key: titleKey(title), category: departmentFor(title, row.category), tidy_version: CATALOG_TIDY_VERSION };
}

export interface CatalogTidySummary {
  read: number;
  retitled: number;
  refiled: number;
  duplicate_sets: number;
  deleted: number;
  kept_referenced: number;
}

export async function runCatalogTidyJob(): Promise<CatalogTidySummary> {
  const summary: CatalogTidySummary = { read: 0, retitled: 0, refiled: 0, duplicate_sets: 0, deleted: 0, kept_referenced: 0 };

  const rows = await listCatalogRowsToTidy(CATALOG_TIDY_VERSION, CATALOG_TIDY.batch);
  summary.read = rows.length;
  const writes = rows.map((row) => {
    const title = displayTitle(row.title) || row.title;
    const category = departmentFor(title, row.category);
    if (title !== row.title) summary.retitled += 1;
    if (category !== row.category) summary.refiled += 1;
    return { id: row.id, title, title_key: titleKey(title), category, tidy_version: CATALOG_TIDY_VERSION };
  });
  await setCatalogTidy(writes);

  await dedupe(summary);

  await logAuditEvent({
    actorId: null,
    actorRole: "system",
    action: "catalog_tidy_run",
    entityType: "job",
    entityId: null,
    metadata: { ...summary, version: CATALOG_TIDY_VERSION },
  });
  logger.info("catalog-tidy: done", { ...summary });
  return summary;
}

/** One listing per product per store; the kept one records why its price is the current one. */
async function dedupe(summary: CatalogTidySummary): Promise<void> {
  const rows = await listCatalogTitleDuplicates(CATALOG_TIDY.dedupeGroups);
  const sets = new Map<string, CatalogDuplicateRow[]>();
  for (const row of rows) {
    const key = `${row.store}\u0000${row.title_key}`;
    sets.set(key, [...(sets.get(key) ?? []), row]);
  }
  const notes: Array<{ id: string; note: string }> = [];
  const drop: string[] = [];
  const parked: Array<{ id: string; title_key: string }> = [];
  for (const set of sets.values()) {
    if (set.length < 2) continue;
    summary.duplicate_sets += 1;
    const { keep, drop: others, note } = pickKeeper(set, STORE_NAME[set[0]!.store] ?? set[0]!.store);
    notes.push({ id: keep.id, note });
    for (const other of others) {
      // In someone's bag, order or watch: never deleted. Its key is parked so the set does not come back every run.
      if (other.referenced) parked.push({ id: other.id, title_key: `${other.title_key} #referenced` });
      else drop.push(other.id);
    }
  }
  await setCatalogDedupeNotes(notes);
  const deleted = await deleteCatalogProducts(drop);
  summary.deleted = deleted.length;
  // A row that became referenced between the read and the delete is parked too.
  const survived = drop.filter((id) => !deleted.includes(id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of survived) parked.push({ id, title_key: `${byId.get(id)!.title_key} #referenced` });
  summary.kept_referenced = parked.length;
  if (parked.length > 0) {
    await setCatalogTidy(
      parked.map((p) => ({ id: p.id, title: "", title_key: p.title_key, category: null, tidy_version: CATALOG_TIDY_VERSION })),
    );
  }
}
