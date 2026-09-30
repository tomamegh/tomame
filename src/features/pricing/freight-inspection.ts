import { createHash } from "node:crypto";
import type { PricingInput, PricingMethod } from "@/lib/pricing";

/**
 * The freight inspector's stored verdict (on `ExtractionResult`, so it lives in
 * `extraction_cache.result`). It never carries money that is charged: the only
 * things that change a price are `corrections`, which are calculator INPUTS.
 * `before` / `after` are a record of what the calculator said with and without
 * them, for the log and for admins.
 */
/** `clear`: no risk signal, so no model call was made and the decision stands. */
export type FreightInspectionStatus = "clear" | "approved" | "corrected" | "skipped" | "failed";

export interface FreightCorrections {
  /** A `TomameCategory` value. */
  category?: string;
  weight_lbs?: number;
  /** `null` = never fixed freight; an id = that active `fixed_freight_items` row. */
  fixed_freight_item_id?: string | null;
}

export interface FreightDecision {
  pricing_method: PricingMethod;
  pricing_group: string | null;
  freight_ghs: number;
  fixed_freight_item: string | null;
  fixed_freight_item_id: string | null;
  weight_lbs: number | null;
}

export interface FreightInspection {
  status: FreightInspectionStatus;
  model: string | null;
  inspected_at: string;
  /** Hash of the facts inspected; an inspection whose key no longer matches is ignored. */
  input_key: string;
  corrections: FreightCorrections;
  before: FreightDecision | null;
  after: FreightDecision | null;
  confidence: number | null;
  reason: string | null;
  ms: number | null;
}

/** The product facts an inspection is valid for. */
export interface FreightFacts {
  title: string | null;
  category: string | null;
  weight_lbs: number | null;
  price: number | null;
  currency: string | null;
}

/**
 * Hash of the inspected facts plus the active fixed-freight ids, so a changed
 * product (enrichment added a weight) or a changed fixed-freight table
 * invalidates the inspection instead of applying a correction made for
 * different inputs.
 */
export function freightInspectionKey(facts: FreightFacts, activeFixedItemIds: readonly string[]): string {
  const payload = JSON.stringify([
    facts.title?.trim() ?? null,
    facts.category ?? null,
    facts.weight_lbs ?? null,
    facts.price ?? null,
    facts.currency?.toUpperCase() ?? null,
    [...activeFixedItemIds].sort(),
  ]);
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

/**
 * The calculator-input patch an inspection contributes, or null when it does
 * not apply (not a correction, or stale). Only fields the inspection corrected
 * are set; everything else stays as the snapshot says.
 */
export function freightCorrectionPatch(
  inspection: FreightInspection | null | undefined,
  facts: FreightFacts,
  activeFixedItemIds: readonly string[],
): Pick<PricingInput, "category" | "weightLbs" | "fixedFreightItemId"> | null {
  if (!inspection || inspection.status !== "corrected") return null;
  if (inspection.input_key !== freightInspectionKey(facts, activeFixedItemIds)) return null;
  const c = inspection.corrections ?? {};
  const patch: Pick<PricingInput, "category" | "weightLbs" | "fixedFreightItemId"> = {};
  if (typeof c.category === "string") patch.category = c.category;
  if (typeof c.weight_lbs === "number" && Number.isFinite(c.weight_lbs) && c.weight_lbs > 0) patch.weightLbs = c.weight_lbs;
  if (c.fixed_freight_item_id === null || typeof c.fixed_freight_item_id === "string") {
    // A named item that has since been deactivated falls back to keyword matching.
    if (c.fixed_freight_item_id === null || activeFixedItemIds.includes(c.fixed_freight_item_id)) {
      patch.fixedFreightItemId = c.fixed_freight_item_id;
    }
  }
  return Object.keys(patch).length ? patch : null;
}
