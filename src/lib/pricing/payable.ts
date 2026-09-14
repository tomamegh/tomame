import type { PricingBreakdown } from "./calculator";

/**
 * Is this breakdown a price somebody can actually be charged?
 *
 * THE TRAP THIS CLOSES. `PricingCalculator.buildReview` does not return null
 * when the engine cannot price something — it returns a fully-formed breakdown
 * whose every total is ZERO. A `!= null` check therefore reads a review verdict
 * as a price, and zero is the smallest number anywhere, so it does not merely
 * slip through: it sorts to the front and presents itself as the cheapest thing
 * on the screen.
 *
 * Found three times in three places before it was named — a catalogue card
 * printing "GH₵0.00 · Cheapest on eBay" against a $79.99 listing, a bag line
 * lighting its pay button for the delivery fee alone, and the sourcing gate
 * treating "priced" as a question it could answer without asking.
 *
 * ITS OWN FILE, AND A TYPE-ONLY IMPORT. `calculator.ts` reaches the exchange-rate
 * service, which builds the service-role Supabase client at module scope; a
 * predicate living there dragged that whole graph into every caller and took out
 * two unit-test suites that have no credentials. `import type` is erased at
 * runtime, so this module pulls in nothing at all.
 *
 * Callers that WANT the review verdict (order intake flags the order and keeps
 * the breakdown) should not use this — they are asking a different question.
 */
export function isPayablePricing(
  pricing: PricingBreakdown | null | undefined,
): pricing is PricingBreakdown {
  if (pricing == null) return false;
  if (pricing.pricing_method === "needs_review") return false;
  return Number.isFinite(pricing.total_ghs) && pricing.total_ghs > 0;
}
