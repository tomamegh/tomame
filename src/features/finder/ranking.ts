import { CUSTOMS_ROW_LABEL, FREIGHT_ROW_LABEL, feeRowLabel } from "@/config/price-story";
import type { PricingBreakdown } from "@/lib/pricing/calculator";
import { taxRowLabel } from "@/lib/pricing/tax-label";

import { formatGhs, formatUsd } from "./format";
import type { FinderBreakdownRow, FinderQuote } from "./types";

/**
 * From the calculator's breakdown to what the finder shows, and the ranking.
 * Pure: no figure is invented here. Rows are the calculator's own amounts at
 * its own rate; labels are the shared price story.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The calculator's breakdown as GH₵ rows. Each dollar line converted on its
 * own can miss the calculator's single conversion by a pesewa, so the item
 * line takes the remainder and the rows always add up to the total.
 */
export function toFinderQuote(b: PricingBreakdown): FinderQuote {
  const rate = b.exchange_rate;
  const tax = r2(b.tax_usd * rate);
  const fee = r2(b.value_fee_usd * rate);
  const ship = r2(b.store_shipping_ghs ?? 0);
  const freight = r2(b.flat_rate_ghs);
  const item = r2(b.total_ghs - freight - tax - fee - ship);
  const qty = b.quantity > 1 ? ` × ${b.quantity}` : "";

  const rows: FinderBreakdownRow[] = [
    { key: "item", label: "Item", amountGhs: item, note: `${formatUsd(b.item_price_usd)}${qty} at ${formatGhs(rate)} to the dollar` },
    { key: "tax", label: taxRowLabel(b, "US sales tax"), amountGhs: tax, note: formatUsd(b.tax_usd) },
    { key: "fee", label: feeRowLabel(b.value_fee_percentage), amountGhs: fee, note: formatUsd(b.value_fee_usd) },
  ];
  if (ship > 0) {
    rows.push({
      key: "store_shipping",
      label: b.store_shipping_option?.label ? `Store shipping · ${b.store_shipping_option.label}` : "Store shipping",
      amountGhs: ship,
      note: formatUsd(b.store_shipping_usd ?? 0),
    });
  }
  rows.push({ key: "freight", label: FREIGHT_ROW_LABEL, amountGhs: freight, note: b.fee_calculation_note || undefined });
  rows.push({ key: "customs", label: CUSTOMS_ROW_LABEL, amountGhs: 0 });

  return {
    totalGhs: b.total_ghs,
    totalUsd: b.total_usd ?? r2(b.total_ghs / rate),
    exchangeRate: rate,
    rows,
  };
}

// ── Ranking ─────────────────────────────────────────────────────────────────

/**
 * - `priced`: a landed total we stand behind.
 * - `confirming`: the store's price (or freight) is not confirmed yet; shown, never best.
 * - `stock_check`: priced far below other new listings; shown, never best (payable).
 */
export type RankState = "priced" | "confirming" | "stock_check";

export interface RankInput {
  id: string;
  title: string;
  storeName: string;
  state: RankState;
  quote: FinderQuote | null;
}

export interface Ranked {
  bestId: string | null;
  /** Everything else, in the order to show it: priced by total, then the rest. */
  alternativeIds: string[];
  why: Record<string, string>;
}

const freightOf = (q: FinderQuote) => q.rows.find((r) => r.key === "freight")?.amountGhs ?? 0;
const shippingOf = (q: FinderQuote) => q.rows.find((r) => r.key === "store_shipping")?.amountGhs ?? 0;

/** "Sony WH-1000XM5 Wireless…" → "Sony WH-1000XM5": the first few words, for a sentence. */
export function shortName(title: string): string {
  // A hyphen inside a model name ("WH-1000XM5") is part of it; a spaced dash starts the blurb.
  const words = title.replace(/(?:[,(|]|\s[–—-]\s).*$/, "").trim().split(/\s+/);
  const short = words.slice(0, 4).join(" ");
  return short.length > 0 ? short : title.slice(0, 32);
}

/**
 * Lowest landed total wins, among candidates that are fully priced. A
 * candidate still confirming or needing a stock check can never be best,
 * whatever its number says. Within budget comes before over it.
 */
export function rankCandidates(candidates: readonly RankInput[], budgetGhs: number | null): Ranked {
  const total = (c: RankInput) => c.quote?.totalGhs ?? Number.POSITIVE_INFINITY;
  const byTotal = (a: RankInput, b: RankInput) => total(a) - total(b);
  const within = (c: RankInput) => budgetGhs == null || total(c) <= budgetGhs;

  const eligible = candidates.filter((c) => c.state === "priced" && c.quote != null).sort(byTotal);
  const best = eligible.find(within) ?? eligible[0] ?? null;

  const rest = candidates.filter((c) => c.id !== best?.id);
  const ordered = [
    ...rest.filter((c) => c.quote != null && c.state !== "confirming").sort(byTotal),
    ...rest.filter((c) => c.quote == null || c.state === "confirming"),
  ];

  const why: Record<string, string> = {};
  if (best?.quote) why[best.id] = bestWhy(best, eligible, ordered, budgetGhs);
  for (const c of ordered) {
    const line = altWhy(c, best);
    if (line) why[c.id] = line;
  }
  return { bestId: best?.id ?? null, alternativeIds: ordered.map((c) => c.id), why };
}

function bestWhy(best: RankInput, eligible: readonly RankInput[], ordered: readonly RankInput[], budgetGhs: number | null): string {
  const q = best.quote!;
  const parts: string[] = [];
  const n = eligible.length;
  const within = budgetGhs != null && q.totalGhs <= budgetGhs;
  if (n > 1) parts.push(`Lowest landed total of the ${n} exact matches we priced${within ? " within your budget" : ""}.`);
  else parts.push(`The only exact match we could price in full${within ? ", and within your budget" : ""}.`);
  if (budgetGhs != null && q.totalGhs > budgetGhs) parts.push(`It is ${formatGhs(q.totalGhs - budgetGhs)} over your budget; nothing we found was under it.`);
  const next = ordered.find((c) => c.quote != null && c.state !== "confirming");
  if (next?.quote) parts.push(`${shortName(next.title)} on ${next.storeName} is ${formatGhs(next.quote.totalGhs - q.totalGhs)} more.`);
  const ship = shippingOf(q);
  if (ship > 0) parts.push(`Includes ${formatGhs(ship)} store shipping to our US hub.`);
  return parts.join(" ");
}

function altWhy(c: RankInput, best: RankInput | null): string | null {
  if (!c.quote || c.state === "confirming") return null;
  if (!best?.quote) return c.state === "stock_check" ? "Much cheaper than other new listings: check the seller before you buy." : null;
  const gap = c.quote.totalGhs - best.quote.totalGhs;
  const parts: string[] = [];
  const name = shortName(best.title);
  parts.push(gap >= 0.005 ? `${formatGhs(gap)} more than ${name}.` : gap <= -0.005 ? `${formatGhs(-gap)} less than ${name}.` : `The same landed total as ${name}.`);
  const fa = freightOf(c.quote);
  const fb = freightOf(best.quote);
  if (Math.abs(fa - fb) >= 0.005) parts.push(`Freight is ${formatGhs(fa)} here against ${formatGhs(fb)}.`);
  else if (Math.abs(gap) >= 0.005) parts.push("Same freight, so the difference is the store price.");
  if (c.state === "stock_check") parts.push("Much cheaper than other new listings: check the seller before you buy.");
  return parts.join(" ");
}
