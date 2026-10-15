import { createHash } from "node:crypto";
import type { PricingInput, PricingMethod } from "@/lib/pricing";

/**
 * The freight inspector's stored verdict (on `ExtractionResult`, so it lives in
 * `extraction_cache.result`). It never carries money that is charged: the only
 * things that change a price are `corrections`, which are calculator INPUTS.
 * `before` / `after` are a record of what the calculator said with and without
 * them, for the log and for admins.
 */
/**
 * `clear`: no risk signal, so no model call was made and the decision stands.
 * `pending`: the check is running in the background. The deterministic price
 * shows meanwhile, but nothing may be paid against it (`freightCheckPending`).
 */
export type FreightInspectionStatus = "clear" | "pending" | "approved" | "corrected" | "skipped" | "failed";

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
  /**
   * How the model got its weight: read off a listing of this exact item, off
   * similar items, or estimated. Absent on inspections made before web search.
   */
  basis?: "found_listed" | "found_similar" | "estimated" | null;
  /** Pages the web search actually returned that the verdict rests on, for admins. */
  sources?: string[];
}

/**
 * How long a `pending` check may hold up payment. Past this the background run
 * is presumed lost (a killed function), the deterministic price stands, and the
 * next read of the product starts a fresh check.
 */
export const FREIGHT_CHECK_MAX_PENDING_MS = 75_000;

/** True while a background freight check is running and the price must not be paid. */
export function freightCheckPending(inspection: FreightInspection | null | undefined, now = Date.now()): boolean {
  if (inspection?.status !== "pending") return false;
  const started = Date.parse(inspection.inspected_at);
  return Number.isFinite(started) && now - started < FREIGHT_CHECK_MAX_PENDING_MS;
}

/**
 * A check worth running again: the model never answered (timeout, error) or a
 * pending run was lost. A check skipped because no model is configured is not:
 * it would only be skipped again.
 */
export function freightCheckDue(inspection: FreightInspection | null | undefined, now = Date.now()): boolean {
  if (!inspection) return false;
  if (inspection.status === "pending") return !freightCheckPending(inspection, now);
  if (inspection.status === "failed") return true;
  return inspection.status === "skipped" && inspection.reason !== NO_MODEL_REASON;
}

/** The `reason` on an inspection skipped because no model key is configured. */
export const NO_MODEL_REASON = "no model configured";

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
): Pick<PricingInput, "category" | "weightLbs" | "weightEstimated" | "fixedFreightItemId"> | null {
  if (!inspection || inspection.status !== "corrected") return null;
  if (inspection.input_key !== freightInspectionKey(facts, activeFixedItemIds)) return null;
  const c = inspection.corrections ?? {};
  const patch: Pick<PricingInput, "category" | "weightLbs" | "weightEstimated" | "fixedFreightItemId"> = {};
  if (typeof c.category === "string") patch.category = c.category;
  // The inspector's weight is its estimate, never a listed weight: labelled so.
  if (typeof c.weight_lbs === "number" && Number.isFinite(c.weight_lbs) && c.weight_lbs > 0) {
    patch.weightLbs = c.weight_lbs;
    patch.weightEstimated = true;
  }
  if (c.fixed_freight_item_id === null || typeof c.fixed_freight_item_id === "string") {
    // A named item that has since been deactivated falls back to keyword matching.
    if (c.fixed_freight_item_id === null || activeFixedItemIds.includes(c.fixed_freight_item_id)) {
      patch.fixedFreightItemId = c.fixed_freight_item_id;
    }
  }
  return Object.keys(patch).length ? patch : null;
}
