import { assessPriceConfidence } from "./price-confidence";
import type { ChainOutcome } from "./resolvers/types";
import type { StoreDefinition } from "./stores";
import type { ExtractionResult } from "./types";

export type ExtractionQualityFields = Pick<ExtractionResult, "price_reads" | "price_source" | "price_confidence" | "quality">;

/**
 * The trust fields a chain outcome adds to an extraction result: every tier's
 * price reading, the tier that won, the A0 confidence verdict, and what the
 * guards refused. Spread into the result where it is built.
 */
export function extractionQualityOf(outcome: ChainOutcome, store: StoreDefinition): ExtractionQualityFields {
  const source = outcome.fieldSources.price ?? null;
  return {
    price_reads: outcome.priceReads,
    price_source: source,
    price_confidence: assessPriceConfidence({ storeCurrency: store.currency, product: outcome.product, priceSource: source, reads: outcome.priceReads }),
    quality: { leaked: outcome.leaked, price_rejected: outcome.priceRejected },
  };
}
