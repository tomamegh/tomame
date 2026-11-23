import { z } from "zod";

import type { FinderStore } from "@/features/finder/store-id";
import type { ParsedFinderSpec } from "./spec";

/**
 * The shortlist's rules in code. Pure.
 *
 * The model picks exact matches by id; these filters run on both sides of it
 * (before, to keep junk out of the prompt; after, on whatever it picked), so a
 * model mistake can never put a renewed console, a phone case or a store we do
 * not buy from in front of a customer.
 */

export interface FinderListing {
  /** Stable within a run: the listing's url hash. */
  id: string;
  store: FinderStore;
  title: string;
  productUrl: string;
  imageUrl: string | null;
  priceUsd: number | null;
  currency: string | null;
  /** The store's own condition text, when the search returns one (eBay). */
  condition: string | null;
  seller: string | null;
  /** eBay's seller record, when the search returns one. */
  sellerFeedback?: { percent: number | null; score: number | null } | null;
  source: "catalogue" | "live";
}

export type DropReason = "carrier_locked" | "risky" | "weak_seller" | "not_new" | "accessory" | "multipack" | "store" | "no_price" | "wrong_item" | "over_budget";

export const DROP_REASON_LABEL: Record<DropReason, (n: number) => string> = {
  not_new: (n) => `${n} not sold as new`,
  accessory: (n) => `${n} ${n === 1 ? "is an accessory" : "are accessories"} or parts`,
  multipack: (n) => `${n} ${n === 1 ? "is a multipack" : "are multipacks"}`,
  store: (n) => `${n} from stores we do not buy from`,
  no_price: (n) => `${n} with no listed price`,
  wrong_item: (n) => `${n} ${n === 1 ? "is a different item" : "are different items"}`,
  over_budget: (n) => `${n} clearly over your budget`,
  weak_seller: (n) => `${n} from sellers with little or poor feedback`,
  carrier_locked: (n) => `${n} locked to a US carrier, which would not work on a Ghanaian SIM`,
  risky: (n) => `${n} with a damaged box, missing parts or a "read the description" warning`,
};

const NOT_NEW_TITLE = /\b(renewed|refurb(?:ished)?|re-?certified|used|pre-?owned|open[\s-]?box|for parts|not working|like new|second[\s-]?hand|grade [abc]|scratch(?:ed)? (?:and|&) dent)\b/i;
const NEW_CONDITION = /^\s*(brand\s+)?new\b(?!.*\b(other|open|defects?|imperfections?)\b)/i;

/** Below this, a seller's record is too thin or too poor to buy a customer's order from. */
export const SELLER_MIN_FEEDBACK_PCT = 98;
export const SELLER_MIN_FEEDBACK_SCORE = 50;

/**
 * New, but with a catch the seller admits in the title: a damaged or missing
 * box, missing parts, "read the description", sold as-is, or a copy. A cheap
 * price on one of these is the poor-condition bargain we do not offer.
 */
const RISKY_TITLE =
  /\b(read (the )?desc(ription)?|see desc(ription)?|read below|see (pics|photos)|(damaged|dented|crushed|torn|no|without|missing) (retail |original )?(box|packaging|package)|box (is |has )?(damaged|dented|crushed|torn|opened|wear)|missing (the )?([a-z]+ )?(parts?|pieces?|accessor(y|ies)|charger|cable|remote|controller|manual)|as[- ]is|untested|empty box|box only|(photo|picture) of (the )?box|replica|knock[- ]?off|cosmetic (damage|wear)|(minor|light|small|has|with) (dents?|scratch(es)?|scuffs?)|scratched|dented|blemish(ed)?)\b/i;

/** True when the title itself warns of damage, missing parts or a catch. */
export function isRiskyListing(title: string): boolean {
  return RISKY_TITLE.test(title);
}

/**
 * US carriers whose phones are sold locked to them. A locked phone will not
 * take an MTN or Telecel SIM, so it is no use in Ghana, however cheap. Only
 * the unambiguous names: "Boost" alone is a bass setting, "Total" a word.
 */
const CARRIER_NAMES =
  "t-?mobile|verizon|at\\s?&\\s?t|att|sprint|boost (?:mobile|infinite)|cricket(?: wireless)?|metro ?pcs|metro by t-?mobile|visible (?:wireless|mobile)|straight ?talk|tracfone|total (?:wireless|by verizon)|u\\.?s\\.? ?cellular|xfinity(?: mobile)?|spectrum mobile|simple mobile|net ?10|page plus|consumer cellular|mint mobile|ultra mobile|family mobile";
const CARRIER = new RegExp(`(?:^|[^a-z0-9])(${CARRIER_NAMES})(?![a-z0-9])`, "i");
const UNLOCKED = /\b(factory |fully |carrier[- ])?unlocked\b/i;

/**
 * True when the title ties the item to a US carrier and does not say it is
 * unlocked ("Verizon iPhone 17 Pro"), unless the customer named that carrier.
 * "Unlocked (works with Verizon, AT&T)" is unlocked and stays.
 */
export function isCarrierLocked(title: string, spec: Pick<ParsedFinderSpec, "product" | "searchQuery">): boolean {
  const m = title.match(CARRIER);
  if (!m || UNLOCKED.test(title)) return false;
  const asked = ` ${spec.product} ${spec.searchQuery} `.toLowerCase();
  const carrier = m[1]!.toLowerCase();
  return !asked.includes(carrier) && !(carrier.replace(/[^a-z]/g, "") === "att" && /\bat\s?&\s?t\b|\batt\b/.test(asked));
}

/** True when the store reports the seller's feedback and it falls short. Unknown is not weak. */
export function isWeakSeller(listing: Pick<FinderListing, "sellerFeedback">): boolean {
  const f = listing.sellerFeedback;
  if (!f) return false;
  if (f.percent != null && f.percent < SELLER_MIN_FEEDBACK_PCT) return true;
  if (f.score != null && f.score < SELLER_MIN_FEEDBACK_SCORE) return true;
  return false;
}

/** True when a listing is not new stock, by its title or by the store's own condition text. */
export function isNotNew(listing: Pick<FinderListing, "title" | "condition">): boolean {
  if (NOT_NEW_TITLE.test(listing.title)) return true;
  if (listing.condition && !NEW_CONDITION.test(listing.condition)) return true;
  return false;
}

const ACCESSORY_NOUNS = [
  "case", "cover", "skin", "protector", "sleeve", "stand", "mount", "holder", "charger", "cable", "adapter",
  "strap", "band", "decal", "sticker", "dock", "grip", "faceplate", "replacement", "remote", "battery",
];
const ACCESSORY_FOR = new RegExp(`\\b(${ACCESSORY_NOUNS.join("|")})e?s?\\s+(for|compatible|fits)\\b`, "i");
const COMPATIBLE = /\b(compatible with|replacement for|designed for|works with)\b/i;

/**
 * True when a listing is an accessory FOR the thing asked about rather than the
 * thing itself: "Silicone case for AirPods Pro", "Charger compatible with PS5".
 * An accessory the customer asked for ("PS5 controller charger") is not one.
 */
export function isAccessoryFor(title: string, spec: Pick<ParsedFinderSpec, "product" | "searchQuery">): boolean {
  const asked = `${spec.product} ${spec.searchQuery}`.toLowerCase();
  const askedAccessory = ACCESSORY_NOUNS.some((noun) => new RegExp(`\\b${noun}e?s?\\b`).test(asked));
  if (askedAccessory) return false;
  return ACCESSORY_FOR.test(title) || COMPATIBLE.test(title);
}

/** Only the unambiguous forms: "2-pack", "3pk", "pack of 4", "set of 2". Piece counts are a Lego set, not a pack. */
const MULTIPACK = /\b(?:(\d+)\s*-?\s*(?:pack|pk)\b|(?:pack|set)\s+of\s+(\d+))/i;

/** True when the title sells several units and the customer did not ask for a pack. */
export function isUnwantedMultipack(title: string, spec: Pick<ParsedFinderSpec, "product" | "searchQuery">): boolean {
  const asked = `${spec.product} ${spec.searchQuery}`;
  if (MULTIPACK.test(asked) || /\b(pack|set|bundle|pair)\b/i.test(asked)) return false;
  const m = title.match(MULTIPACK);
  if (!m) return false;
  const n = Number(m[1] ?? m[2]);
  return Number.isFinite(n) && n > 1;
}

/** Stores whose search page can leave a price out while the product page has one. */
const PRICE_ON_PAGE_STORES: ReadonlySet<FinderStore> = new Set<FinderStore>(["amazon", "walmart"]);

export interface PostFilterResult {
  kept: FinderListing[];
  dropped: Partial<Record<DropReason, number>>;
}

function count(dropped: Partial<Record<DropReason, number>>, reason: DropReason): void {
  dropped[reason] = (dropped[reason] ?? 0) + 1;
}

/**
 * The hard rules: a store we buy from, no damage or catch admitted in the title, a listed price (or a live Amazon or
 * Walmart row, whose page is read for it), new, a seller with a
 * sound record (where the store reports one), not an accessory
 * for the thing asked about, not a multipack nobody asked for.
 */
export function postFilterListings(
  listings: readonly FinderListing[],
  spec: Pick<ParsedFinderSpec, "product" | "searchQuery">,
  allowedStores: ReadonlySet<FinderStore>,
): PostFilterResult {
  const kept: FinderListing[] = [];
  const dropped: Partial<Record<DropReason, number>> = {};
  for (const l of listings) {
    if (!allowedStores.has(l.store)) count(dropped, "store");
    // Amazon hides the price of some items in search (consoles, "see options"); the store read prices those.
    else if ((l.priceUsd == null || !(l.priceUsd > 0)) && !(l.source === "live" && PRICE_ON_PAGE_STORES.has(l.store))) count(dropped, "no_price");
    else if (isNotNew(l)) count(dropped, "not_new");
    else if (isRiskyListing(l.title)) count(dropped, "risky");
    else if (isCarrierLocked(l.title, spec)) count(dropped, "carrier_locked");
    else if (isWeakSeller(l)) count(dropped, "weak_seller");
    else if (isAccessoryFor(l.title, spec)) count(dropped, "accessory");
    else if (isUnwantedMultipack(l.title, spec)) count(dropped, "multipack");
    else kept.push(l);
  }
  return { kept, dropped };
}

/** Over the budget by more than the margin: a clear miss, not worth pricing. */
export function isClearlyOverBudget(estimateGhs: number | null, budgetGhs: number | null, margin: number): boolean {
  if (budgetGhs == null || estimateGhs == null) return false;
  return estimateGhs > budgetGhs * (1 + margin);
}

// ── The model's half ─────────────────────────────────────────────────────────

export const ShortlistOutputSchema = z.object({
  matches: z.array(z.string()).describe("Ids of listings that are exactly the requested item, best match first."),
  rejected: z
    .array(
      z.object({
        id: z.string(),
        reason: z.enum(["wrong_item", "accessory", "not_new", "multipack"]),
      }),
    )
    .describe("Every other listing id, with the main reason it is not the requested item."),
  likely_meant: z
    .object({
      ids: z.array(z.string()).describe("Listings that are almost certainly what the shopper means, best first."),
      product: z.string().describe("That product's real name as stores sell it, e.g. 'Kirkland Minoxidil 5% for men'."),
      reason: z.string().describe("One short sentence for the shopper on why this is what they mean."),
    })
    .nullable()
    .describe("Only when matches is empty: listings the shopper almost certainly means though the words differ. Null otherwise."),
});
export type ShortlistOutput = z.infer<typeof ShortlistOutputSchema>;
/** Parsing side: an answer without `likely_meant` (older prompt, a stub) still reads. */
const ShortlistInputSchema = ShortlistOutputSchema.extend({ likely_meant: ShortlistOutputSchema.shape.likely_meant.optional() });

/**
 * Model output → the listings it picked, in its order, with the drop reasons it
 * gave. Unknown or repeated ids are ignored; anything the model left out of
 * both lists counts as a different item. Null when the output is malformed.
 */
export function applyShortlistOutput(
  raw: unknown,
  listings: readonly FinderListing[],
): ShortlistResult | null {
  const parsed = ShortlistInputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const byId = new Map(listings.map((l) => [l.id, l]));
  const seen = new Set<string>();
  const matches: FinderListing[] = [];
  for (const id of parsed.data.matches) {
    const l = byId.get(id);
    if (!l || seen.has(id)) continue;
    seen.add(id);
    matches.push(l);
  }
  const dropped: Partial<Record<DropReason, number>> = {};
  for (const r of parsed.data.rejected) {
    if (!byId.has(r.id) || seen.has(r.id)) continue;
    seen.add(r.id);
    count(dropped, r.reason);
  }
  for (const l of listings) if (!seen.has(l.id)) count(dropped, "wrong_item");
  return { matches, dropped, likely: matches.length === 0 ? likelyMeantOf(parsed.data.likely_meant, byId) : null };
}

/** What the shopper almost certainly means when no listing is literally it (Kelvin, 2026-11-23: "Kirkland beard spray"). */
export interface LikelyMeant {
  listings: FinderListing[];
  product: string;
  reason: string;
}

export interface ShortlistResult {
  matches: FinderListing[];
  dropped: Partial<Record<DropReason, number>>;
  likely?: LikelyMeant | null;
}

function likelyMeantOf(raw: ShortlistOutput["likely_meant"] | undefined, byId: Map<string, FinderListing>): LikelyMeant | null {
  if (!raw) return null;
  const product = raw.product.replace(/\s+/g, " ").trim().slice(0, 120);
  const reason = raw.reason.replace(/\s+/g, " ").trim().slice(0, 240);
  const listings = [...new Set(raw.ids)].map((id) => byId.get(id)).filter((l): l is FinderListing => l != null);
  if (listings.length === 0 || product.length < 2 || reason.length < 2) return null;
  return { listings, product, reason };
}

/** Sum two drop tallies. */
export function mergeDrops(...all: Partial<Record<DropReason, number>>[]): Partial<Record<DropReason, number>> {
  const out: Partial<Record<DropReason, number>> = {};
  for (const d of all) for (const [k, v] of Object.entries(d)) if (v) out[k as DropReason] = (out[k as DropReason] ?? 0) + v;
  return out;
}

/** "25 not sold as new", … largest first, for the shortlist step's details. */
export function dropDetails(dropped: Partial<Record<DropReason, number>>): string[] {
  return (Object.entries(dropped) as [DropReason, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => DROP_REASON_LABEL[reason](n));
}

const STOP_WORDS = new Set(["the", "a", "an", "for", "and", "with", "of", "new", "in", "to", "on", "by"]);
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

/**
 * The fallback when the model gives no usable answer: a listing is kept only
 * when its title carries every word of the search. Stricter than the model,
 * so an outage narrows the answer rather than loosening it.
 */
export function keywordMatches(spec: Pick<ParsedFinderSpec, "searchQuery">, listings: readonly FinderListing[]): FinderListing[] {
  const wanted = tokens(spec.searchQuery);
  if (wanted.length === 0) return [];
  return listings.filter((l) => {
    const have = new Set(tokens(l.title));
    return wanted.every((t) => have.has(t));
  });
}
