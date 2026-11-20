/**
 * The one price story (trust & polish sprint, 2026-11-20).
 *
 * Every customer-facing sentence about freight, customs and the Tomame fee is
 * here, verbatim, and every breakdown builder reads it from here. Copy is not
 * paraphrased per screen: a test (`__tests__/price-story.test.ts`) fails when a
 * breakdown prints freight without "incl. customs & clearance" or a fee other
 * than the engine's own percentage.
 *
 * Pure and framework-free: imported by server services, client components and
 * email templates alike.
 */

// ── Freight ─────────────────────────────────────────────────────────────────

/** The full freight label, where there is room for it (fees, lanes, hero). */
export const FREIGHT_LABEL = "Freight, incl. customs & clearance – no extra charge on delivery";

/** The freight row label in a breakdown. Never bare "Freight". */
export const FREIGHT_ROW_LABEL = "Freight, incl. customs & clearance";

/** The rest of `FREIGHT_LABEL`, for a breakdown that draws a sub-line. */
export const FREIGHT_ROW_SUBLINE = "no extra charge on delivery";

/**
 * The freight headline. There is no single per-lb figure that is true for most
 * quotes (12 categories are flat GH₵, ~5 per lb, 12 per-category expressions),
 * so the headline names the rule and the worked examples carry the numbers.
 */
export const FREIGHT_HEADLINE =
  "Freight, incl. customs & clearance – set by category and weight, shown on every quote before you pay";

// ── Customs ─────────────────────────────────────────────────────────────────

/**
 * The customs row, in every breakdown even at zero. Display only: it adds
 * nothing to any total. Split across a row's label and value so a two-column
 * receipt still reads the sentence verbatim.
 */
export const CUSTOMS_ROW_LABEL = "Customs & clearance – Included in freight";
export const CUSTOMS_ROW_VALUE = "GH₵0 extra";
export const CUSTOMS_LINE = `${CUSTOMS_ROW_LABEL} – ${CUSTOMS_ROW_VALUE}`;

// ── Tomame fee ──────────────────────────────────────────────────────────────

/**
 * "4%" from the engine's fraction. The label is always computed from the
 * percentage the engine charged, so the words can never disagree with the sum.
 */
export function formatFeePercent(fraction: number): string {
  const rounded = Math.round(fraction * 1000) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/** Breakdown row label: "Tomame fee – 4% flat". Bare "Tomame fee" when the rate is unknown. */
export function feeRowLabel(fraction: number | null | undefined): string {
  return fraction != null && Number.isFinite(fraction) ? `Tomame fee – ${formatFeePercent(fraction)} flat` : "Tomame fee";
}

/** The fee promise: "Tomame fee – 4% flat on the item price. No category tiers." */
export function feeSentence(fraction: number): string {
  return `Tomame fee – ${formatFeePercent(fraction)} flat on the item price. No category tiers.`;
}

// ── FAQ ─────────────────────────────────────────────────────────────────────

export interface PriceFaq {
  /** Anchor on /faq, linked from /fees. */
  slug: string;
  question: string;
  answer: string;
}

export const CUSTOMS_FAQ: PriceFaq = {
  slug: "customs-on-delivery",
  question: "Will I pay customs on delivery?",
  answer:
    "No. Customs duty and clearance are included in the freight price you see before you pay. What you see is what you pay - no extra charge on delivery in Greater Accra.",
};

export const FEE_FAQ: PriceFaq = {
  slug: "tomame-fee",
  question: "How much is the Tomame fee?",
  answer:
    "4% flat on the item price. The same 4% applies to every category - there are no category tiers and no higher rate.",
};

export const PRICE_FAQS: readonly PriceFaq[] = [CUSTOMS_FAQ, FEE_FAQ];

/** The landing hero's list of what a quote shows. */
export const HERO_PRICE_PARTS = "item, tax, fee, freight (incl. customs)";
