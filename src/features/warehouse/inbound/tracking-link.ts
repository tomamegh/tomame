/**
 * "Number or link": staff paste whatever the store's shipping email gives them.
 * A carrier tracking link carries the number in its query or path, so the
 * number is pulled out here and then checked by the one validator,
 * `trackingInputProblem` (Fix 12). Anything else is passed through unchanged
 * and that validator names what is wrong with it.
 *
 * Pure: the purchase and tracking sheets use it in the browser.
 */

import { detectCarrier, trackingInputProblem, trackingKey } from "./tracking-number";

/** Query keys carriers and stores put the tracking number under. */
const NUMBER_PARAMS = [
  "tracknum",
  "tracknumbers",
  "trknbr",
  "tlabels",
  "tracking-id",
  "trackingid",
  "trackingnumber",
  "tracking_number",
  "trackingnumbers",
  "inquirynumber1",
  "number",
  "tracking",
  "id",
];

/** The tracking number inside a carrier link, or null when the text is not a link with one. */
export function trackingFromLink(raw: string): string | null {
  const text = raw.trim();
  if (!/^(https?:\/\/|www\.)/i.test(text)) return null;
  let url: URL;
  try {
    url = new URL(/^www\./i.test(text) ? `https://${text}` : text);
  } catch {
    return null;
  }
  const params = new Map([...url.searchParams.entries()].map(([k, v]) => [k.toLowerCase(), v]));
  for (const key of NUMBER_PARAMS) {
    const value = params.get(key)?.split(/[,\s]/)[0];
    if (value && trackingInputProblem(value) == null) return value;
  }
  // Path-style links (".../track/1Z999AA10123456784") and the hash Royal Mail uses.
  const tokens = `${url.pathname}/${url.hash}`.split(/[/#?=&]+/).map(trackingKey).filter(Boolean);
  for (const token of tokens.reverse()) {
    if (detectCarrier(token) !== "other" && trackingInputProblem(token) == null) return token;
  }
  return null;
}

/** What staff typed, split on commas and new lines, each link turned into its number. */
export function readTrackingEntries(raw: string): Array<{ input: string; number: string; problem: string | null }> {
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((input) => {
      const number = trackingFromLink(input) ?? input;
      return { input, number, problem: trackingInputProblem(number) };
    });
}
