/**
 * A listing priced far below the other exact matches for the same new item.
 *
 * The cheapest new "AirPods Pro 2" on eBay at $82 against $240-$320 elsewhere
 * is not a bargain to put first: it is a likely counterfeit, a used item listed
 * as new, or a mistake. Such a listing is still shown, but goes through a
 * staff seller check before anyone can pay, and is never picked as best.
 *
 * Needs at least `minReferences` priced exact matches to judge; with fewer,
 * nothing is flagged rather than guessing.
 */
export const OUTLIER_RATIO = 0.6;
export const OUTLIER_MIN_REFERENCES = 3;

export function medianOf(values: readonly number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/** With only two matches there is no median to trust, so only an extreme gap counts. */
export const OUTLIER_PAIR_RATIO = 0.4;

export interface OutlierReference {
  /** The typical price: the median of three or more matches, or the dearer of two. */
  priceUsd: number;
  ratio: number;
}

/** What a match is judged against, or null when there is too little to judge. */
export function outlierReference(matchPricesUsd: readonly number[], minReferences = OUTLIER_MIN_REFERENCES): OutlierReference | null {
  const priced = matchPricesUsd.filter((x) => Number.isFinite(x) && x > 0);
  if (priced.length >= minReferences) return { priceUsd: medianOf(priced)!, ratio: OUTLIER_RATIO };
  if (priced.length === 2) return { priceUsd: Math.max(...priced), ratio: OUTLIER_PAIR_RATIO };
  return null;
}

/** The typical price of three or more exact matches, or null. */
export function referencePriceUsd(matchPricesUsd: readonly number[], minReferences = OUTLIER_MIN_REFERENCES): number | null {
  const priced = matchPricesUsd.filter((x) => Number.isFinite(x) && x > 0);
  return priced.length >= minReferences ? medianOf(priced) : null;
}

export function isSuspiciouslyLow(priceUsd: number | null | undefined, reference: OutlierReference | number | null, ratio = OUTLIER_RATIO): boolean {
  if (reference == null || priceUsd == null || !(priceUsd > 0)) return false;
  const ref = typeof reference === "number" ? { priceUsd: reference, ratio } : reference;
  return priceUsd < ref.priceUsd * ref.ratio;
}

/** The reason staff and the customer see. */
export function outlierReason(priceUsd: number, referenceUsd: number): string {
  const fmt = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;
  return `Price far below other new listings (${fmt(priceUsd)} against a typical ${fmt(referenceUsd)}): we check the seller before you pay`;
}

/** True when this price sits far below the others in `allPricesUsd` (see `outlierReference`). */
export function isOutlierListing(priceUsd: number | null | undefined, allPricesUsd: readonly number[]): boolean {
  return isSuspiciouslyLow(priceUsd, outlierReference(allPricesUsd));
}
