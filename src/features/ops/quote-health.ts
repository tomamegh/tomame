import { finderHealthLine, type FinderHealth } from "@/features/finder/health";

import type { AlertCandidate } from "./alert-rules";

/**
 * Quote correctness in platform health (plan A6, A0b). Pure: the query layer
 * hands over rows, this counts them, the daily email, /admin/ops and the
 * five-minute alert job all read the result.
 */

export const QUOTE_HEALTH_RULES = {
  /** Window for the extraction counters. */
  windowHours: 24,
  /** Quotes priced only from our own page parse. */
  htmlOnly: { minQuotes: 5, maxShare: 0.2 },
  /** Amazon pastes the structured tiers did not price. */
  amazonStructuredFailure: { minQuotes: 8, maxShare: 0.25 },
  /** Prices thrown out by the A3 guard in the window. */
  priceRejections: { min: 3 },
  /** Any script leaking into a field is a parser regression. */
  leakedScripts: { min: 1 },
  /** A paste still pending/running this long is stuck. */
  stuckPasteMinutes: 10,
  stuckPastes: { min: 3 },
  /** Customers waiting on a staff price/stock check this long. */
  checkWaitMinutes: 120,
  /** Quoted-vs-paid drift: median absolute drift over the last 30 days, with enough orders to mean something. */
  drift: { windowDays: 30, minOrders: 3, maxMedianAbs: 0.05 },
  /** A notification a dispatcher should have sent, still pending after this long. */
  notificationPendingMinutes: 30,
} as const;

/** Tiers that read a page we fetched ourselves, or a model's reading of it. */
const HTML_TIERS = new Set(["platform-html", "structured-data", "llm", "apify"]);
const STRUCTURED_TIERS = new Set(["scraperapi", "amazon-offers", "oxylabs", "zyte", "rainforest", "ebay", "shopify", "staff"]);

export interface QuoteRowInput {
  platform: string | null;
  /** `result.price_source`; null on rows cached before 103 or with no price. */
  price_source: string | null;
  /** `result.source` (title tier), the fallback for old rows. */
  source: string | null;
  price: number | null;
  confidence: string | null;
  leaked: number;
  price_rejected: boolean;
}

export interface PaidOrderInput {
  platform: string | null;
  tier: string | null;
  quoted_price: number | null;
  quoted_currency: string | null;
  paid_price: number;
  paid_currency: string;
}

export interface QuoteHealthInput {
  quotes: QuoteRowInput[];
  stuckPastes: number;
  checksWaiting: { price: number; stock: number; oldestMinutes: number | null };
  paid: PaidOrderInput[];
  /** Rows a dispatcher sends (WhatsApp) still pending past the threshold. */
  notificationsStuck: { count: number; oldestMinutes: number | null };
  /** Email-channel rows: in-app bell entries no job ever sends (by design). Info only. */
  bellOnlyPending: number;
}

export interface DriftGroup {
  key: string;
  platform: string;
  tier: string;
  orders: number;
  /** Median of (paid − quoted) / quoted, e.g. 0.031 = paid 3.1% more than quoted. */
  medianDrift: number;
  worstDrift: number;
}

export interface QuoteHealth {
  quotes: number;
  priced: number;
  htmlOnly: number;
  unconfirmed: number;
  priceRejected: number;
  leakedScripts: number;
  amazon: { quotes: number; structuredPriced: number; failureRate: number | null };
  stuckPastes: number;
  checksWaiting: QuoteHealthInput["checksWaiting"];
  drift: { orders: number; medianAbs: number | null; groups: DriftGroup[] };
  notificationsStuck: QuoteHealthInput["notificationsStuck"];
  bellOnlyPending: number;
  /** The AI price finder's day (105); absent when it could not be read. */
  finder?: FinderHealth | null;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function buildQuoteHealth(input: QuoteHealthInput): QuoteHealth {
  const priced = input.quotes.filter((q) => q.price != null && q.price > 0);
  const tierOf = (q: QuoteRowInput) => q.price_source ?? q.source;
  const amazon = input.quotes.filter((q) => q.platform === "amazon");
  const amazonStructured = amazon.filter((q) => q.price != null && STRUCTURED_TIERS.has(tierOf(q) ?? ""));

  const drifts: Array<{ key: string; platform: string; tier: string; d: number }> = [];
  for (const o of input.paid) {
    if (o.quoted_price == null || !(o.quoted_price > 0) || !(o.paid_price > 0)) continue;
    if (o.quoted_currency && o.quoted_currency.toUpperCase() !== o.paid_currency.toUpperCase()) continue;
    const platform = o.platform ?? "unknown";
    const tier = o.tier ?? "unknown";
    drifts.push({ key: `${platform}/${tier}`, platform, tier, d: (o.paid_price - o.quoted_price) / o.quoted_price });
  }
  const groups = new Map<string, DriftGroup & { all: number[] }>();
  for (const x of drifts) {
    const g = groups.get(x.key) ?? { key: x.key, platform: x.platform, tier: x.tier, orders: 0, medianDrift: 0, worstDrift: 0, all: [] };
    g.orders += 1;
    g.all.push(x.d);
    if (Math.abs(x.d) > Math.abs(g.worstDrift)) g.worstDrift = x.d;
    groups.set(x.key, g);
  }

  return {
    quotes: input.quotes.length,
    priced: priced.length,
    htmlOnly: priced.filter((q) => HTML_TIERS.has(tierOf(q) ?? "")).length,
    unconfirmed: priced.filter((q) => q.confidence === "unconfirmed").length,
    priceRejected: input.quotes.filter((q) => q.price_rejected).length,
    leakedScripts: input.quotes.reduce((n, q) => n + q.leaked, 0),
    amazon: {
      quotes: amazon.length,
      structuredPriced: amazonStructured.length,
      failureRate: amazon.length ? r3(1 - amazonStructured.length / amazon.length) : null,
    },
    stuckPastes: input.stuckPastes,
    checksWaiting: input.checksWaiting,
    drift: {
      orders: drifts.length,
      medianAbs: drifts.length ? r3(median(drifts.map((x) => Math.abs(x.d)))!) : null,
      groups: [...groups.values()]
        .map(({ all, ...g }) => ({ ...g, medianDrift: r3(median(all) ?? 0), worstDrift: r3(g.worstDrift) }))
        .sort((a, b) => b.orders - a.orders),
    },
    notificationsStuck: input.notificationsStuck,
    bellOnlyPending: input.bellOnlyPending,
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Staff alerts when a threshold trips. Keys are stable while the same thing is wrong. */
export function quoteHealthCandidates(h: QuoteHealth): AlertCandidate[] {
  const R = QUOTE_HEALTH_RULES;
  const out: AlertCandidate[] = [];
  if (h.priced >= R.htmlOnly.minQuotes && h.htmlOnly / h.priced > R.htmlOnly.maxShare) {
    out.push({ key: "quotes:html-only", level: "warning", title: "Quotes are falling back to our page parser", detail: `${h.htmlOnly} of ${h.priced} priced quotes in 24 h came only from our own HTML parse (over ${pct(R.htmlOnly.maxShare)}). A vendor tier is failing.`, href: "/admin/ops" });
  }
  const a = h.amazon;
  if (a.quotes >= R.amazonStructuredFailure.minQuotes && a.failureRate != null && a.failureRate > R.amazonStructuredFailure.maxShare) {
    out.push({ key: "quotes:amazon-structured", level: "warning", title: "Amazon structured reads are failing", detail: `${a.quotes - a.structuredPriced} of ${a.quotes} Amazon quotes in 24 h were not priced by ScraperAPI/Zyte (${pct(a.failureRate)}). Check the ScraperAPI key and credits.`, href: "/admin/ops" });
  }
  if (h.priceRejected >= R.priceRejections.min) {
    out.push({ key: "quotes:price-rejected", level: "warning", title: "Prices are being rejected by the page guard", detail: `${h.priceRejected} page prices in 24 h contradicted the page itself or were implausible, so customers were asked to enter the price.`, href: "/admin/ops" });
  }
  if (h.leakedScripts >= R.leakedScripts.min) {
    out.push({ key: "quotes:leaked-script", level: "warning", title: "A store page leaked script into a product field", detail: `${h.leakedScripts} scraped field(s) in 24 h were script, not text, and were dropped. A parser needs a look.`, href: "/admin/ops" });
  }
  if (h.stuckPastes >= R.stuckPastes.min) {
    out.push({ key: "quotes:stuck-pastes", level: "warning", title: "Pasted links are stuck", detail: `${h.stuckPastes} pastes have been reading for more than ${R.stuckPasteMinutes} minutes.`, href: "/admin/pastes" });
  }
  const w = h.checksWaiting;
  if (w.oldestMinutes != null && w.oldestMinutes >= R.checkWaitMinutes) {
    out.push({ key: "quotes:checks-waiting", level: "warning", title: "Customers are waiting on price or stock checks", detail: `${w.price} price and ${w.stock} stock checks open; the oldest has waited ${Math.round(w.oldestMinutes)} minutes. Those customers cannot pay.`, href: w.stock >= w.price ? "/admin/stock-checks" : "/admin/price-checks" });
  }
  if (h.drift.orders >= R.drift.minOrders && h.drift.medianAbs != null && h.drift.medianAbs > R.drift.maxMedianAbs) {
    const worst = h.drift.groups[0];
    out.push({ key: "quotes:drift", level: "warning", title: "Quotes drift from what stores charge", detail: `Median quoted-vs-paid gap is ${pct(h.drift.medianAbs)} over ${h.drift.orders} purchases in ${R.drift.windowDays} days${worst ? `; most purchases: ${worst.key} at ${pct(worst.medianDrift)}` : ""}.`, href: "/admin/ops" });
  }
  const n = h.notificationsStuck;
  if (n.count > 0) {
    out.push({ key: "notifications:stuck", level: "warning", title: "Notifications are not being sent", detail: `${n.count} WhatsApp notification(s) still pending after ${R.notificationPendingMinutes} minutes${n.oldestMinutes != null ? ` (oldest ${Math.round(n.oldestMinutes)} min)` : ""}. Check the dispatch cron and the WhatsApp token.`, href: "/admin/notifications" });
  }
  return out;
}

/** Plain lines for the daily email. */
export function quoteHealthLines(h: QuoteHealth): string[] {
  const lines = [
    `Quotes (24 h): ${h.quotes} read, ${h.priced} priced; ${h.htmlOnly} from our HTML parser only; ${h.unconfirmed} unconfirmed; ${h.priceRejected} prices rejected by the page guard; ${h.leakedScripts} leaked-script fields dropped.`,
    `Amazon structured tiers: ${h.amazon.failureRate == null ? "no Amazon quotes" : `${h.amazon.structuredPriced} of ${h.amazon.quotes} priced (${pct(1 - h.amazon.failureRate)})`}.`,
    `Pastes stuck over ${QUOTE_HEALTH_RULES.stuckPasteMinutes} min: ${h.stuckPastes}. Checks waiting on staff: ${h.checksWaiting.price} price, ${h.checksWaiting.stock} stock.`,
    h.drift.orders
      ? `Quoted vs paid (${QUOTE_HEALTH_RULES.drift.windowDays} d, ${h.drift.orders} purchases): median gap ${pct(h.drift.medianAbs ?? 0)}; ${h.drift.groups.slice(0, 4).map((g) => `${g.key} ${g.medianDrift >= 0 ? "+" : ""}${pct(g.medianDrift)} (${g.orders})`).join(", ")}.`
      : "Quoted vs paid: no store prices recorded yet.",
    `Notifications pending over ${QUOTE_HEALTH_RULES.notificationPendingMinutes} min: ${h.notificationsStuck.count} (WhatsApp). In-app bell entries (email channel, never sent by design): ${h.bellOnlyPending}.`,
  ];
  if (h.finder) lines.push(finderHealthLine(h.finder));
  return lines;
}
