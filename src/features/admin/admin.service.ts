import "server-only";

import {
  countAllOrders,
  countProfiles,
  listBoxesApproachingCutoff,
  listOpenBagLines,
  listOrdersSince,
  listPasteJobsSince,
  listRecentOrders,
  listRecentSettledPayments,
  listSettledPaymentsSince,
  type BoxCutoffRow,
  type CappedRows,
  type DashboardOrderRow,
  type OpenBagLineRow,
  type PasteJobRow,
  type RecentOrderRow,
  type RecentPaymentRow,
  type SettledPaymentRow,
} from "@/db/queries/admin-dashboard";
import { getAdminQueueCounts, type AdminQueueCounts } from "@/db/queries/admin-queues";
import { logger } from "@/lib/logger";

/**
 * The admin overview — everything `/admin` renders, in one server-side read.
 *
 * WHAT WAS WRONG BEFORE. The old dashboard answered a question nobody was
 * asking. It showed four totals, a chart and three "latest N" tables, none of
 * which told an admin what needed doing, and two of its four figures were not
 * true:
 *
 *  - **Revenue summed ORDER TOTALS, not money.** It added
 *    `admin_total_ghs ?? pricing.total_ghs` across every order in
 *    `paid|processing|in_transit|delivered|completed`. Order status is a state
 *    an admin can set by hand and `admin_total_ghs` is a re-price, so neither is
 *    evidence that a cedi arrived; meanwhile a bag checkout's delivery fee and
 *    consolidation saving live on `order_groups` (048) and were missing
 *    entirely. `payments.status = 'success'` is the only record of settled
 *    money and is what this service uses.
 *  - **"Active users" counted nobody in particular.** It was the distinct
 *    `user_id` of orders in the last 30 days, labelled "users using the
 *    platform" — which is neither everyone active (a customer pasting links and
 *    filling a bag is invisible to it) nor a stated definition. It is now
 *    "customers who placed an order", and the screen says so.
 *
 * WHAT IT LEADS WITH NOW. The four queues the sidebar badges, because those are
 * the only numbers on the screen that represent a person waiting. Everything
 * else — the money, the trend, extraction health, bags, boxes — is context for
 * the decision those four prompt.
 *
 * FAILURE POLICY. Every read is wrapped in `degrade()` and every panel is
 * independently nullable. One flaky table leaves one tile reading "unavailable"
 * on a screen that has otherwise rendered; it never 500s the first page of the
 * admin. A MISSING table degrades too, unlike the customer surfaces where
 * `isSchemaMissingError` rethrows to make a deploy-before-migrate loud — the
 * same reasoning `db/queries/admin-queues.ts` gives: this is the screen an admin
 * would be standing on while they fixed it.
 */

// ── Windows ──────────────────────────────────────────────────────────────────

/** The trend chart, the revenue tile and the order tile all cover this window. */
export const DASHBOARD_WINDOW_DAYS = 30;

/**
 * Extraction health is read over a week, not a month.
 *
 * It is an operational alarm rather than a statistic: a month-long denominator
 * would take days to react to a store that started refusing the extractor this
 * morning. Seven days also matches the window the sidebar counts failed pastes
 * over, so the badge and the tile cannot tell different stories.
 */
export const EXTRACTION_WINDOW_DAYS = 7;

/** How far ahead a box cutoff counts as "approaching". Three days. */
export const BOX_CUTOFF_WINDOW_HOURS = 72;

/** Rows in the two activity tables. Enough to recognise a pattern, not a list. */
export const RECENT_ORDER_LIMIT = 8;
export const RECENT_PAYMENT_LIMIT = 6;

// ── View model ───────────────────────────────────────────────────────────────

/**
 * A panel that could not be read. Rendered as "unavailable", never as zero:
 * zero is a claim about the business and a failed query is a claim about the
 * database, and the first screen of the admin must not confuse the two.
 */
export type Panel<T> = T | null;

export interface DashboardMoney {
  /** Settled money over the window, in GHS. */
  settledGhs: number;
  /** How many successful payments made it up. */
  paymentCount: number;
  /** Mean settled payment in GHS, or null when nothing settled. */
  averagePaymentGhs: number | null;
  /**
   * The window exceeded the query's row cap, so these are floors rather than
   * totals. The tile says "at least" when this is set.
   */
  truncated: boolean;
}

export interface DashboardOrders {
  /** Orders placed in the window, cancellations excluded. */
  placed: number;
  /** Of those, the ones that are no longer live. */
  cancelled: number;
  /** Every order ever placed. Null when the count could not be read. */
  allTime: number | null;
  truncated: boolean;
}

export interface DashboardCustomers {
  /** Distinct customers with at least one non-cancelled order in the window. */
  ordering: number;
  /** Every registered profile, for scale. Null when unreadable. */
  registered: number | null;
}

export interface DashboardExtraction {
  /** Pastes in the extraction window. */
  total: number;
  /** Pastes that produced a usable price (`status = 'ready'`). */
  ready: number;
  /** Pastes the extractor gave up on. */
  failed: number;
  /** Still queued or mid-flight — no verdict yet, so not counted against us. */
  working: number;
  /**
   * `ready / (ready + failed)`, 0–1. Null when nothing has finished: a rate
   * over an empty denominator is not 0%, it is unknown.
   */
  successRate: number | null;
}

export interface DashboardBags {
  /** Open bags holding at least one line. An empty cart row is not demand. */
  bags: number;
  /** Lines across them, quantity included. */
  items: number;
  /**
   * Their total AT ADD-TO-BAG PRICES (048: `cart_items.pricing` is
   * informational and every customer render re-prices). Never presented as
   * today's price.
   */
  valueGhs: number;
  /** Lines still waiting on a paste, whose price does not exist yet. */
  unpricedLines: number;
  truncated: boolean;
}

export interface DashboardBoxes {
  /** Open boxes whose cutoff falls inside the window. */
  count: number;
  /** The soonest of them, for the tile's second line. */
  soonest: { label: string; cutoffAt: string } | null;
}

/** One day of the trend chart. Every day in the window is present, zeros included. */
export interface DashboardSeriesPoint {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  orders: number;
  revenueGhs: number;
  pastes: number;
}

export interface DashboardOrderSummary {
  id: string;
  productName: string;
  status: string;
  originCountry: string;
  quantity: number;
  needsReview: boolean;
  createdAt: string;
  /** The admin's re-price when there is one, otherwise the quoted total. */
  totalGhs: number | null;
  /** True when the figure above is an admin's override rather than the quote. */
  totalIsAdminPriced: boolean;
}

export interface DashboardPaymentSummary {
  id: string;
  reference: string;
  amountGhs: number;
  createdAt: string;
}

export interface AdminDashboardView {
  /** The instant every relative time on the screen is measured from. */
  generatedAt: string;
  /** Inclusive start of the 30-day window, `YYYY-MM-DD` UTC. */
  windowStart: string;
  /** Inclusive end — today, UTC. */
  windowEnd: string;
  windowDays: number;
  extractionWindowDays: number;
  boxCutoffWindowHours: number;

  queues: Panel<AdminQueueCounts>;
  money: Panel<DashboardMoney>;
  orders: Panel<DashboardOrders>;
  customers: Panel<DashboardCustomers>;
  extraction: Panel<DashboardExtraction>;
  bags: Panel<DashboardBags>;
  boxes: Panel<DashboardBoxes>;
  series: Panel<DashboardSeriesPoint[]>;
  recentOrders: Panel<DashboardOrderSummary[]>;
  recentPayments: Panel<DashboardPaymentSummary[]>;
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Everything `/admin` shows.
 *
 * `now` is injected so the whole screen — the window, the day buckets, "in 9 h"
 * on a box cutoff — is measured from ONE instant. A render that called
 * `Date.now()` in three places can put a row on the wrong side of a boundary
 * from the heading above it, and makes the derivations untestable.
 *
 * Ghana observes GMT all year and never shifts for daylight saving, so the
 * server's UTC date is also the admin's local date and no timezone library is
 * needed — the same assumption `features/app-home/services/home.service.ts`
 * documents for the greeting.
 */
export async function getAdminDashboard(
  now: Date = new Date(),
): Promise<AdminDashboardView> {
  const windowStartDate = startOfUtcDayBefore(now, DASHBOARD_WINDOW_DAYS - 1);
  const windowStartIso = windowStartDate.toISOString();
  const extractionStartIso = new Date(
    now.getTime() - EXTRACTION_WINDOW_DAYS * DAY_MS,
  ).toISOString();
  const cutoffUntilIso = new Date(
    now.getTime() + BOX_CUTOFF_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const [
    queues,
    payments,
    orders,
    pastes,
    allTimeOrders,
    registered,
    bagLines,
    boxes,
    recentOrders,
    recentPayments,
  ] = await Promise.all([
    degrade(getAdminQueueCounts(), null as Panel<AdminQueueCounts>, "queue counts"),
    degrade(
      listSettledPaymentsSince(windowStartIso),
      null as Panel<CappedRows<SettledPaymentRow>>,
      "settled payments",
    ),
    degrade(
      listOrdersSince(windowStartIso),
      null as Panel<CappedRows<DashboardOrderRow>>,
      "orders in window",
    ),
    // One 30-day read serves both the chart's paste series and the 7-day health
    // tile — the tile filters this list rather than asking the database twice.
    degrade(
      listPasteJobsSince(windowStartIso),
      null as Panel<CappedRows<PasteJobRow>>,
      "paste jobs",
    ),
    degrade(countAllOrders(), null as number | null, "all-time order count"),
    degrade(countProfiles(), null as number | null, "registered customers"),
    degrade(listOpenBagLines(), null as Panel<CappedRows<OpenBagLineRow>>, "open bags"),
    degrade(
      listBoxesApproachingCutoff(now.toISOString(), cutoffUntilIso),
      null as Panel<BoxCutoffRow[]>,
      "boxes near cutoff",
    ),
    degrade(
      listRecentOrders(RECENT_ORDER_LIMIT),
      null as Panel<RecentOrderRow[]>,
      "recent orders",
    ),
    degrade(
      listRecentSettledPayments(RECENT_PAYMENT_LIMIT),
      null as Panel<RecentPaymentRow[]>,
      "recent payments",
    ),
  ]);

  return {
    generatedAt: now.toISOString(),
    windowStart: utcDateKey(windowStartDate),
    windowEnd: utcDateKey(now),
    windowDays: DASHBOARD_WINDOW_DAYS,
    extractionWindowDays: EXTRACTION_WINDOW_DAYS,
    boxCutoffWindowHours: BOX_CUTOFF_WINDOW_HOURS,

    queues,
    money: payments && summariseMoney(payments),
    orders: orders && summariseOrders(orders, allTimeOrders),
    customers: orders && summariseCustomers(orders, registered),
    extraction:
      pastes && summariseExtraction(filterSince(pastes.rows, extractionStartIso)),
    bags: bagLines && summariseBags(bagLines),
    boxes: boxes && summariseBoxes(boxes),
    series:
      payments && orders && pastes
        ? buildSeries(windowStartDate, DASHBOARD_WINDOW_DAYS, {
            orders: orders.rows,
            payments: payments.rows,
            pastes: pastes.rows,
          })
        : null,
    recentOrders: recentOrders && recentOrders.map(toOrderSummary),
    recentPayments: recentPayments && recentPayments.map(toPaymentSummary),
  };
}

// ── Derivations (pure, tested directly) ──────────────────────────────────────

/**
 * Settled money, from payments alone.
 *
 * Pesewas → GHS happens here, once, so no component ever divides by 100. The
 * division is rounded to the cent because summing thousands of pesewas and then
 * dividing is exact, but JavaScript's float will still hand back 12345.679999.
 */
export function summariseMoney(
  payments: CappedRows<SettledPaymentRow>,
): DashboardMoney {
  const pesewas = payments.rows.reduce((sum, row) => sum + row.amount, 0);
  const settledGhs = roundToCents(pesewas / 100);
  const paymentCount = payments.rows.length;
  return {
    settledGhs,
    paymentCount,
    averagePaymentGhs:
      paymentCount > 0 ? roundToCents(settledGhs / paymentCount) : null,
    truncated: payments.truncated,
  };
}

/**
 * Orders placed in the window.
 *
 * Cancellations are split out rather than dropped: "42 placed, 3 cancelled" is
 * a different business week from "42 placed", and a cancelled order still
 * consumed a buyer's attention.
 */
export function summariseOrders(
  orders: CappedRows<DashboardOrderRow>,
  allTime: number | null,
): DashboardOrders {
  const cancelled = orders.rows.filter((row) => row.status === "cancelled").length;
  return {
    placed: orders.rows.length - cancelled,
    cancelled,
    allTime,
    truncated: orders.truncated,
  };
}

/**
 * Customers who bought, over the window.
 *
 * A distinct count over non-cancelled orders. It is NOT "active users" — this
 * screen states the definition next to the number precisely because the figure
 * it replaced did not, and an admin comparing it to sign-ups would otherwise
 * read it as traffic.
 */
export function summariseCustomers(
  orders: CappedRows<DashboardOrderRow>,
  registered: number | null,
): DashboardCustomers {
  const buyers = new Set<string>();
  for (const row of orders.rows) {
    if (row.status !== "cancelled") buyers.add(row.user_id);
  }
  return { ordering: buyers.size, registered };
}

/**
 * How often a pasted link ends up with a price.
 *
 * The denominator is pastes that FINISHED (`ready` + `failed`). Counting the
 * ones still queued or running against the rate would make the number sag every
 * time a burst arrived and recover on its own a minute later, which is exactly
 * the false alarm an operational tile must not raise. With nothing finished the
 * rate is null — unknown, not zero.
 */
export function summariseExtraction(rows: readonly PasteJobRow[]): DashboardExtraction {
  let ready = 0;
  let failed = 0;
  let working = 0;
  for (const row of rows) {
    if (row.status === "ready") ready += 1;
    else if (row.status === "failed") failed += 1;
    else working += 1;
  }
  const finished = ready + failed;
  return {
    total: rows.length,
    ready,
    failed,
    working,
    successRate: finished > 0 ? ready / finished : null,
  };
}

/**
 * Open bags, their lines and what those lines were quoted at.
 *
 * Bags are counted by distinct `cart_id` across the LINES, so a cart row with
 * nothing in it never appears — an abandoned session that never added an item
 * is not demand, and counting it would make the best leading indicator the
 * admin has drift upwards on its own.
 */
export function summariseBags(lines: CappedRows<OpenBagLineRow>): DashboardBags {
  const bags = new Set<string>();
  let items = 0;
  let valueGhs = 0;
  let unpricedLines = 0;

  for (const line of lines.rows) {
    bags.add(line.cart_id);
    items += line.quantity;
    if (line.pricing_total_ghs == null) unpricedLines += 1;
    else valueGhs += line.pricing_total_ghs;
  }

  return {
    bags: bags.size,
    items,
    valueGhs: roundToCents(valueGhs),
    unpricedLines,
    truncated: lines.truncated,
  };
}

/** The count, plus the one deadline worth naming. Rows arrive soonest-first. */
export function summariseBoxes(rows: readonly BoxCutoffRow[]): DashboardBoxes {
  const first = rows[0];
  return {
    count: rows.length,
    soonest: first
      ? { label: first.label?.trim() || first.region_code, cutoffAt: first.cutoff_at }
      : null,
  };
}

/**
 * The daily trend, with every day in the window present.
 *
 * Zero-filled from a generated list of dates rather than from the rows, so a day
 * on which nothing happened plots as a zero instead of vanishing — recharts
 * joins across a missing key, which drew a straight line over a quiet weekend
 * and made it look like steady trade.
 *
 * Revenue is settled payments, matching the tile above it. The old chart plotted
 * order totals under the same word and the two figures could not be reconciled.
 */
export function buildSeries(
  windowStart: Date,
  days: number,
  input: {
    orders: readonly DashboardOrderRow[];
    payments: readonly SettledPaymentRow[];
    pastes: readonly PasteJobRow[];
  },
): DashboardSeriesPoint[] {
  const buckets = new Map<string, DashboardSeriesPoint>();
  for (let offset = 0; offset < days; offset += 1) {
    const date = utcDateKey(new Date(windowStart.getTime() + offset * DAY_MS));
    buckets.set(date, { date, orders: 0, revenueGhs: 0, pastes: 0 });
  }

  for (const order of input.orders) {
    if (order.status === "cancelled") continue;
    const bucket = buckets.get(dayKeyOf(order.created_at));
    if (bucket) bucket.orders += 1;
  }

  for (const payment of input.payments) {
    const bucket = buckets.get(dayKeyOf(payment.created_at));
    if (bucket) bucket.revenueGhs += payment.amount / 100;
  }

  for (const paste of input.pastes) {
    const bucket = buckets.get(dayKeyOf(paste.created_at));
    if (bucket) bucket.pastes += 1;
  }

  return Array.from(buckets.values()).map((point) => ({
    ...point,
    revenueGhs: roundToCents(point.revenueGhs),
  }));
}

// ── Row mapping ──────────────────────────────────────────────────────────────

/**
 * An admin's re-price wins over the quoted breakdown when there is one (031) —
 * it is the figure the order will actually be charged at — and the row says
 * which of the two it is showing rather than presenting them as the same thing.
 */
function toOrderSummary(row: RecentOrderRow): DashboardOrderSummary {
  const adminPriced = row.admin_total_ghs != null;
  return {
    id: row.id,
    productName: row.product_name,
    status: row.status,
    originCountry: row.origin_country,
    quantity: row.quantity,
    needsReview: row.needs_review,
    createdAt: row.created_at,
    totalGhs: adminPriced ? row.admin_total_ghs : row.pricing_total_ghs,
    totalIsAdminPriced: adminPriced,
  };
}

function toPaymentSummary(row: RecentPaymentRow): DashboardPaymentSummary {
  return {
    id: row.id,
    reference: row.reference,
    amountGhs: roundToCents(row.amount / 100),
    createdAt: row.created_at,
  };
}

// ── Time ─────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC, `daysBack` whole days before `now`. */
function startOfUtcDayBefore(now: Date, daysBack: number): Date {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return new Date(start.getTime() - daysBack * DAY_MS);
}

/** `YYYY-MM-DD`, UTC. */
export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The day bucket a stored timestamp belongs to, without parsing it. */
function dayKeyOf(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function filterSince<T extends { created_at: string }>(
  rows: readonly T[],
  sinceIso: string,
): T[] {
  return rows.filter((row) => row.created_at >= sinceIso);
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── Failure policy ───────────────────────────────────────────────────────────

async function degrade<T>(work: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await work;
  } catch (error) {
    logger.warn(`admin dashboard: ${label} failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}
