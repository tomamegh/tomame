import { formatGhs, formatGhsCompact } from "./format";
import type { FinderEvent } from "./types";

/**
 * The run's narration. Pure. Every line is built from what the job actually
 * did (stores searched, listings counted, prices confirmed); nothing here
 * describes a step that did not happen.
 */

/** Distributes `Omit` over the event union, so each member keeps its own fields. */
type WithoutAt<T> = T extends unknown ? Omit<T, "at"> : never;
export type FinderEventInput = WithoutAt<FinderEvent>;

/** An append-only event log whose clock starts at the run's start. */
export class FinderNarrator {
  readonly events: FinderEvent[];
  constructor(
    private readonly startedAt: number,
    private readonly clock: () => number = Date.now,
    initial: FinderEvent[] = [],
  ) {
    this.events = [...initial];
  }

  emit(event: FinderEventInput): FinderEvent {
    const stamped = { ...event, at: Math.max(0, this.clock() - this.startedAt) } as FinderEvent;
    this.events.push(stamped);
    return stamped;
  }
}

/** ["Amazon", "eBay", "Walmart"] → "Amazon, eBay and Walmart". */
export function listNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function searchStartedLabel(storeNames: readonly string[]): string {
  return storeNames.length > 0 ? `Searching ${listNames(storeNames)}` : "Searching what we have already priced";
}

export interface StoreSearchOutcome {
  name: string;
  listings: number;
  failed: boolean;
}

/** "Searched Amazon and eBay · 14 listings". */
export function searchSummary(searched: readonly StoreSearchOutcome[], catalogueListings: number): string {
  const answered = searched.filter((s) => !s.failed);
  const live = answered.reduce((n, s) => n + s.listings, 0);
  const total = live + catalogueListings;
  if (answered.length === 0) {
    return catalogueListings > 0
      ? `Searched what we have already priced · ${plural(catalogueListings, "listing", "listings")}`
      : "No store search came back";
  }
  return `Searched ${listNames(answered.map((s) => s.name))} · ${plural(total, "listing", "listings")}`;
}

export type StoreSkipReason = "budget" | "no_key" | "failed";

/** The details under the search step: what else was looked at, and what was skipped and why. */
export function searchDetails(catalogueListings: number, skipped: ReadonlyArray<{ name: string; reason: StoreSkipReason }>): string[] {
  const out: string[] = [];
  if (catalogueListings > 0) out.push(`${plural(catalogueListings, "listing", "listings")} we had already priced`);
  const by = (r: StoreSkipReason) => skipped.filter((s) => s.reason === r).map((s) => s.name);
  if (by("budget").length) out.push(`${listNames(by("budget"))} not searched: this month's search allowance is used up`);
  if (by("no_key").length) out.push(`${listNames(by("no_key"))} not searched: store search is not set up`);
  if (by("failed").length) out.push(`${listNames(by("failed"))} did not answer in time`);
  return out;
}

/** "3 are the exact item" — of how many looked at. */
export function shortlistSummary(matches: number, considered: number): string {
  if (matches === 0) return considered === 1 ? "The one listing is not the exact item" : `None of the ${considered} listings is the exact item`;
  return `${matches} of ${considered} ${matches === 1 ? "is" : "are"} the exact item`;
}

/** "All 3 prices confirmed at the store" / "2 of 3 prices confirmed. Still confirming one with the store." */
export function priceSummary(confirmed: number, checked: number, unreadable: number): string {
  if (checked === 0) return "No prices to check";
  const read = checked - unreadable;
  const tail = unreadable > 0 ? ` ${plural(unreadable, "page", "pages")} could not be read.` : "";
  if (read === 0) return `We could not read the price on any of the ${checked} store pages.`;
  if (confirmed === read) return `${read === 1 ? "The price is" : `All ${read} prices`} confirmed at the store.${tail}`;
  const waiting = read - confirmed;
  return `${confirmed} of ${read} prices confirmed. Still confirming ${waiting === 1 ? "one" : waiting} with the store.${tail}`;
}

/** "Freight to Accra is GH₵285, customs and clearance included" — the freight actually priced. */
export function freightSummary(freightsGhs: readonly number[]): string {
  if (freightsGhs.length === 0) return "Freight could not be worked out for these items";
  const lo = Math.min(...freightsGhs);
  const hi = Math.max(...freightsGhs);
  const range = Math.abs(hi - lo) < 0.005 ? formatGhs(lo) : `${formatGhs(lo)} to ${formatGhs(hi)}`;
  return `Freight to Accra is ${range}, customs and clearance included`;
}

/** "Ranked by landed total. 2 fit your budget." */
export function compareSummary(priced: number, withinBudget: number | null): string {
  if (priced === 0) return "No price confirmed yet to compare";
  const budget = withinBudget == null ? "" : withinBudget === priced ? " All fit your budget." : ` ${withinBudget} of ${priced} fit your budget.`;
  return `Ranked by landed total.${budget}`;
}

/** The no-match line, naming the stores actually searched. */
export function nothingFoundMessage(product: string | null, storeNames: readonly string[], reason: "no_listings" | "no_exact" | "no_price" | "not_understood" | "failed"): string {
  const where = storeNames.length > 0 ? `${listNames(storeNames)} and what we have already priced` : "what we have already priced";
  switch (reason) {
    case "not_understood":
      return "We could not tell which product you mean. A buyer can help, or try naming the brand and model.";
    case "failed":
      return "We could not finish this search on our side. A buyer can look for you, or try again in a few minutes.";
    case "no_listings":
      return `We searched ${where} and found no listings for ${product ?? "this"}.`;
    case "no_exact":
      return `We searched ${where} and found no new ${product ?? "item"} we can buy and ship for you.`;
    case "no_price":
      return `We found ${product ?? "matches"} but could not confirm a price at any store.`;
  }
}

/** "F-1A2B3C4D": the reference a customer quotes on WhatsApp. */
export function finderReference(runId: string): string {
  return `F-${runId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/** The message a buyer receives on WhatsApp, exactly as the customer will send it. */
export function buyerHandoffText(query: string, budgetGhs: number | null, runId: string): string {
  const budget = budgetGhs != null ? `, up to ${formatGhsCompact(budgetGhs)}` : "";
  return `Hi Tomame, please help me find this: ${query} (new${budget}). Ref ${finderReference(runId)}`;
}
