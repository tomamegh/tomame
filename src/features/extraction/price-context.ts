import type { ExtractionResult } from "./types";

/**
 * Why a price is what it is, from facts we hold and nothing else: the store's
 * own list (strike-through) price, the store's own deal badge, and our earlier
 * read of the same listing. Kelvin, 2026-11-22: a price that drops overnight
 * with no explanation "makes me look deceitful". Pure; shared by the quote,
 * the bag, the finder and the assistant, so they never tell different stories.
 */

/** One earlier read of the listing, kept when a re-read changed the price. */
export interface PriceHistoryEntry {
  price: number;
  currency: string;
  /** When that price was read, ISO. */
  at: string;
}

export interface PriceContext {
  price: number;
  currency: string;
  /** The store's own list / strike-through price, only when above today's. */
  listPrice: number | null;
  /** Whole-percent saving against `listPrice`. */
  savingPct: number | null;
  /** The store's own deal badge, word for word ("Limited time deal"). */
  dealLabel: string | null;
  /** Our latest earlier read at a different price, within `PREVIOUS_MAX_DAYS`. */
  previous: PriceHistoryEntry | null;
}

/** Earlier reads kept per listing. */
export const PRICE_HISTORY_MAX = 5;
/** An earlier read older than this is not "the price before" any more. */
export const PREVIOUS_MAX_DAYS = 60;
/** A list price this close to today's is noise, not a saving. */
const MIN_SAVING_PCT = 3;

type HistoryCarrier = Pick<ExtractionResult, "product" | "fetched_at" | "price_history">;

const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const cents = (n: number) => Math.round(n * 100);

/**
 * `next` with the stored read's price appended to its history when the price
 * changed. A read without a price (store blocked, out of stock) keeps the
 * history as it was; a different currency is a different listing and starts over.
 */
export function carryPriceHistory<T extends HistoryCarrier>(stored: HistoryCarrier | null, next: T): T {
  const kept = stored?.price_history ?? [];
  const before = stored?.product?.price;
  const beforeCurrency = stored?.product?.currency ?? null;
  const now = next.product?.price;
  const nowCurrency = next.product?.currency ?? null;
  if (!valid(now) || !nowCurrency) return kept.length ? { ...next, price_history: kept } : next;
  const sameListing = kept.filter((h) => h.currency === nowCurrency);
  let history = sameListing;
  if (valid(before) && beforeCurrency === nowCurrency && cents(before) !== cents(now) && stored?.fetched_at) {
    history = [...sameListing, { price: before, currency: beforeCurrency, at: stored.fetched_at }].slice(-PRICE_HISTORY_MAX);
  }
  return history.length ? { ...next, price_history: history } : { ...next, price_history: undefined };
}

export function priceContextOf(result: Pick<ExtractionResult, "product" | "price_history"> | null | undefined, now = Date.now()): PriceContext | null {
  const product = result?.product;
  const price = product?.price;
  const currency = product?.currency;
  if (!valid(price) || !currency) return null;

  const rawList = product.metadata?.listPrice;
  const list = valid(rawList) && rawList > price && rawList <= price * 10 ? rawList : null;
  const savingPct = list ? Math.round(((list - price) / list) * 100) : null;
  const listPrice = savingPct != null && savingPct >= MIN_SAVING_PCT ? list : null;

  const rawDeal = product.metadata?.deal;
  const dealLabel = typeof rawDeal === "string" && rawDeal.trim() && rawDeal.length <= 60 ? rawDeal.trim() : null;

  const cutoff = now - PREVIOUS_MAX_DAYS * 86_400_000;
  const previous =
    [...(result?.price_history ?? [])]
      .reverse()
      .find((h) => h.currency === currency && valid(h.price) && cents(h.price) !== cents(price) && Date.parse(h.at) >= cutoff && Date.parse(h.at) <= now) ?? null;

  if (!listPrice && !dealLabel && !previous) return null;
  return { price, currency, listPrice, savingPct: listPrice ? savingPct : null, dealLabel, previous };
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** "21 Nov", in Accra time. */
export function shortDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Accra" }).format(new Date(iso));
}

/**
 * Customer copy, store prices in the store's currency. Each part is a fact:
 * "30% off Amazon's $138.00 list price" · "Down from $138.00 when we checked on 21 Nov".
 */
export function priceContextParts(ctx: PriceContext | null, storeName: string | null): string[] {
  if (!ctx) return [];
  const parts: string[] = [];
  const store = storeName ? `${storeName}'s` : "the store's";
  const sameAsList = ctx.previous != null && ctx.listPrice != null && Math.round(ctx.previous.price * 100) === Math.round(ctx.listPrice * 100);
  if (ctx.listPrice && ctx.savingPct) {
    const when = sameAsList ? `, the price we read on ${shortDay(ctx.previous!.at)}` : "";
    parts.push(`${ctx.savingPct}% off ${store} ${money(ctx.listPrice, ctx.currency)} list price${when}`);
  }
  if (ctx.dealLabel && !parts.length) parts.push(ctx.dealLabel);
  if (ctx.previous && !sameAsList) {
    const way = ctx.previous.price > ctx.price ? "Down" : "Up";
    parts.push(`${way} from ${money(ctx.previous.price, ctx.currency)} when we checked on ${shortDay(ctx.previous.at)}`);
  }
  return parts;
}

/** The same facts for the assistant, labelled as facts so it repeats them and nothing more. */
export function priceContextFacts(ctx: PriceContext | null): string | null {
  if (!ctx) return null;
  const facts: string[] = [];
  if (ctx.listPrice && ctx.savingPct) facts.push(`store list price ${money(ctx.listPrice, ctx.currency)}, today ${money(ctx.price, ctx.currency)} (${ctx.savingPct}% off)`);
  if (ctx.dealLabel) facts.push(`store's own deal badge: "${ctx.dealLabel}"`);
  if (ctx.previous) facts.push(`we read ${money(ctx.previous.price, ctx.currency)} on ${shortDay(ctx.previous.at)}, ${money(ctx.price, ctx.currency)} now`);
  return facts.length ? `price facts: ${facts.join("; ")}` : null;
}

/**
 * The US shopping calendar the assistant may mention, around Black Friday
 * (the day after the fourth Thursday of November) through Cyber Monday. A
 * calendar fact, never a claim about one item's price.
 */
export function shoppingSeasonNote(now = new Date()): string | null {
  const year = now.getUTCFullYear();
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const firstThursday = 1 + ((4 - nov1.getUTCDay() + 7) % 7);
  const blackFriday = new Date(Date.UTC(year, 10, firstThursday + 21 + 1));
  const cyberMonday = new Date(blackFriday.getTime() + 3 * 86_400_000);
  const from = blackFriday.getTime() - 10 * 86_400_000;
  const to = cyberMonday.getTime() + 2 * 86_400_000;
  if (now.getTime() < from || now.getTime() > to) return null;
  const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
  return `It is Black Friday season: Black Friday is ${day(blackFriday)} ${year} and Cyber Monday is ${day(cyberMonday)}. US stores run deals through that week and can end them without notice.`;
}

/**
 * Under every store price we show (Kelvin, 2026-11-23): the price is the
 * store's when we read it, and stores change prices.
 */
export function storePriceDisclaimer(storeName: string | null, several = false): string {
  if (several) return "Store prices change. Check each price on the store's page before you pay.";
  return `Store prices change. Check the price on ${storeName ?? "the store's page"} before you pay.`;
}
