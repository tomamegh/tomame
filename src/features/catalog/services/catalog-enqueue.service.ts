import "server-only";

import { enqueueDerivedQuery } from "@/db/queries/catalog";
import { getValidExtractionById } from "@/db/queries/extraction-cache";
import { logger } from "@/lib/logger";
import { catalogStoreFor, deriveCatalogTerm } from "./catalog-term";

/**
 * A pasted link teaches the catalogue what to scrape next (055).
 *
 * Kelvin: "once the user paste their own link we should scrape similar
 * products." This is that, and the shape of it is the interesting part.
 *
 * IT DOES NOT SCRAPE. The obvious build fires a vendor search the moment
 * someone pastes. That is wrong twice: the vendor is a free tier of roughly 1000
 * calls a MONTH already shared with the live quote path, so N pastes become 2N
 * calls and the budget is gone in a week, taking quoting down with it; and it
 * puts a slow third-party search on the critical path of the one screen whose
 * entire design is about answering fast.
 *
 * So a paste ENQUEUES a term and the existing hourly, budget-capped
 * `catalog-scrape` job spends a call on it when it can afford one. The customer
 * gets similar products from the catalogue we already hold, and the catalogue
 * gets better every time somebody pastes. The feature compounds instead of
 * costing.
 *
 * NOTHING HERE MAY FAIL THE PASTE. Every error is swallowed and logged. By the
 * time this runs the customer has their price; a catalogue we could not enrich
 * must never turn a successful quote into a failure. That is the same rule
 * `notifyPasteFinished` follows, for the same reason, after a notification
 * failure once requeued a finished extraction and charged a vendor twice.
 */
export type EnqueueOutcome =
  | "enqueued"
  | "already_known"
  | "no_category"
  | "no_term"
  | "unusable"
  | "error";

export async function enqueueCatalogQueryFromPaste(
  extractionCacheId: string,
): Promise<EnqueueOutcome> {
  try {
    const cached = await getValidExtractionById(extractionCacheId);
    if (!cached) return "unusable";

    const result = cached.result as {
      product?: { title?: string | null; brand?: string | null; category?: string | null };
      platform?: string | null;
    } | null;

    const product = result?.product;

    // CATEGORY IS REQUIRED, and not only because the column is NOT NULL.
    // `catalog_queries.category` is what the scraper searches within and what
    // the admin console groups by; a term filed under a guess would pull the
    // wrong products into the catalogue and nobody would know which term did it.
    // An extraction that could not classify the product is exactly the case
    // where we should not be guessing what it is similar to.
    const category = product?.category?.trim();
    if (!category) return "no_category";

    const term = deriveCatalogTerm(product?.title, product?.brand);
    if (!term) return "no_term";

    const created = await enqueueDerivedQuery({
      store: catalogStoreFor(result?.platform),
      category,
      query: term,
      cacheId: extractionCacheId,
    });

    if (created) {
      logger.info("catalogue: a paste enqueued a new search term", {
        extractionCacheId,
        term,
        category,
      });
    }
    return created ? "enqueued" : "already_known";
  } catch (error) {
    logger.warn("catalogue: could not enqueue a term from a paste", {
      extractionCacheId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "error";
  }
}
