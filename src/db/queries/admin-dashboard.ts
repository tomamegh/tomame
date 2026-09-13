import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ExtractionRequestStatus } from "@/db/queries/extraction-requests";

/**
 * The reads behind `/admin` — the dashboard, and nothing else.
 *
 * WHY A FILE OF ITS OWN. The dashboard answers "what needs me right now?" and
 * that question crosses seven tables that otherwise have nothing to do with each
 * other: orders, payments, profiles, the paste queue, open bags and the boxes
 * they pack into. None of those owners wants a dashboard-shaped query bolted
 * onto their module, and the dashboard does not want to pull a whole bag view
 * to count two numbers. So the overview's reads live together, here.
 *
 * DATA ACCESS ONLY (CLAUDE.md). Every function returns rows or a count; not one
 * of them decides what a figure MEANS. "Settled revenue", "a bag in flight",
 * "extraction health" are all resolved in `features/admin/admin.service.ts`,
 * where they can be read in one place and tested.
 *
 * THESE THROW. The service wraps each call in its own `degrade()` so one broken
 * panel shows as unavailable instead of taking the first screen of the admin
 * down — so swallowing the error here would only rob it of the chance.
 *
 * ROW CAPS. PostgREST answers an uncapped `select` with its own default page of
 * 1000 rows and says nothing about the rows it withheld. A revenue figure summed
 * from a silently truncated page is the worst kind of wrong number: plausible,
 * specific and too low. Every list here therefore asks for `ROW_CAP + 1` rows
 * and reports `truncated` when it gets them, so the screen can mark the figure
 * as a floor rather than state it as fact.
 */

/**
 * How many rows a windowed list will read before it admits it is guessing.
 *
 * Chosen to be far above a month of real traffic and far below anything that
 * would make a single page load feel slow. When a window genuinely exceeds it
 * the honest fix is a SQL aggregate (an RPC), not a bigger number here.
 */
export const DASHBOARD_ROW_CAP = 5000;

/** A bounded list, plus whether the cap cut it short. */
export interface CappedRows<T> {
  rows: T[];
  truncated: boolean;
}

// ── Row shapes ───────────────────────────────────────────────────────────────

/** A payment Paystack actually settled. `amount` is pesewas (GHS × 100). */
export interface SettledPaymentRow {
  created_at: string;
  amount: number;
}

export interface DashboardOrderRow {
  created_at: string;
  user_id: string;
  status: string;
}

export interface PasteJobRow {
  created_at: string;
  status: ExtractionRequestStatus;
}

/**
 * One line of somebody's open bag.
 *
 * `pricing_total_ghs` is `cart_items.pricing.total_ghs` — the breakdown taken at
 * add-to-bag time. Migration 048 is explicit that this is INFORMATIONAL and that
 * every customer-facing render re-prices from the live snapshot, so the service
 * must label any total built from it as "at bag prices" rather than pass it off
 * as what these bags would cost today. Null on a line whose paste is still being
 * read (049) — there is no price yet to record.
 */
export interface OpenBagLineRow {
  cart_id: string;
  quantity: number;
  pricing_total_ghs: number | null;
}

export interface BoxCutoffRow {
  id: string;
  label: string | null;
  region_code: string;
  cutoff_at: string;
  departs_at: string | null;
}

export interface RecentOrderRow {
  id: string;
  product_name: string;
  status: string;
  origin_country: string;
  quantity: number;
  needs_review: boolean;
  created_at: string;
  /** The admin's own re-price, when one was set (031). */
  admin_total_ghs: number | null;
  /** The quoted breakdown the customer agreed to. */
  pricing_total_ghs: number | null;
}

export interface RecentPaymentRow {
  id: string;
  reference: string;
  /** Pesewas, as stored. The service converts; components never divide. */
  amount: number;
  status: string;
  created_at: string;
}

// ── Counts ───────────────────────────────────────────────────────────────────

/** Every order ever placed, cancelled ones included. */
export async function countAllOrders(): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("orders")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Failed to count orders: ${error.message}`);
  return count ?? 0;
}

/** Every registered profile. One row per `auth.users` row (001). */
export async function countProfiles(): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Failed to count customers: ${error.message}`);
  return count ?? 0;
}

// ── Windowed lists ───────────────────────────────────────────────────────────

/**
 * Payments that reached `success` since `sinceIso`.
 *
 * `status = 'success'` is the whole point: this is the only table that records
 * money the business actually received. An order sitting in `paid` is a state
 * an admin can set by hand, and `admin_total_ghs` is a re-price rather than a
 * charge — neither is evidence that a cedi moved.
 */
export async function listSettledPaymentsSince(
  sinceIso: string,
): Promise<CappedRows<SettledPaymentRow>> {
  const { data, error } = await createAdminClient()
    .from("payments")
    .select("created_at, amount")
    .eq("status", "success")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(DASHBOARD_ROW_CAP + 1);
  if (error) throw new Error(`Failed to load settled payments: ${error.message}`);

  return cap(
    (data ?? []).map((row) => ({
      created_at: String(row.created_at),
      amount: numberOr(row.amount, 0),
    })),
  );
}

/** Orders placed since `sinceIso`, cancellations included so the service can decide. */
export async function listOrdersSince(
  sinceIso: string,
): Promise<CappedRows<DashboardOrderRow>> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("created_at, user_id, status")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(DASHBOARD_ROW_CAP + 1);
  if (error) throw new Error(`Failed to load orders: ${error.message}`);

  return cap(
    (data ?? []).map((row) => ({
      created_at: String(row.created_at),
      user_id: String(row.user_id),
      status: String(row.status),
    })),
  );
}

/**
 * Every paste since `sinceIso`, with the job state 049 put on the row.
 *
 * Reading `created_at` and `status` only: this is the denominator of the
 * extraction success rate, and the product URLs behind it belong to the paste
 * queue screen, not to an aggregate.
 */
export async function listPasteJobsSince(
  sinceIso: string,
): Promise<CappedRows<PasteJobRow>> {
  const { data, error } = await createAdminClient()
    .from("extraction_requests")
    .select("created_at, status")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(DASHBOARD_ROW_CAP + 1);
  if (error) throw new Error(`Failed to load paste jobs: ${error.message}`);

  return cap(
    (data ?? []).map((row) => ({
      created_at: String(row.created_at),
      status: String(row.status) as ExtractionRequestStatus,
    })),
  );
}

/**
 * The lines sitting in every bag that is still open.
 *
 * Joined the cheap way round — from `cart_items` with an inner embed on
 * `carts` — because a bag with no lines in it is not "a bag in flight", it is a
 * cart row somebody's session created and never used. Starting from `carts`
 * would have to fetch those and then discard them.
 *
 * Both signed-in and signed-out bags are included: a signed-out visitor's bag is
 * owned by the `tm_quote_session` cookie (048) and is exactly as much real
 * demand as a signed-in one.
 */
export async function listOpenBagLines(): Promise<CappedRows<OpenBagLineRow>> {
  const { data, error } = await createAdminClient()
    .from("cart_items")
    .select("cart_id, quantity, pricing, carts!inner(status)")
    .eq("carts.status", "open")
    .limit(DASHBOARD_ROW_CAP + 1);
  if (error) throw new Error(`Failed to load open bag lines: ${error.message}`);

  return cap(
    (data ?? []).map((row) => ({
      cart_id: String(row.cart_id),
      quantity: numberOr(row.quantity, 1),
      pricing_total_ghs: numberOrNull(
        (row.pricing as { total_ghs?: unknown } | null)?.total_ghs,
      ),
    })),
  );
}

/**
 * Open boxes whose cutoff falls between `fromIso` and `untilIso`, soonest first.
 *
 * `fromIso` excludes boxes whose cutoff has already passed: those are not a
 * deadline any more, they are a box somebody forgot to close, and mixing the two
 * would leave the tile permanently non-zero — a count that is never zero stops
 * being read (the same reason the sidebar refuses to badge Orders).
 *
 * Unbounded on purpose: a window of a few days holds a handful of boxes, and a
 * cap here would hide the very deadline the tile exists to surface.
 */
export async function listBoxesApproachingCutoff(
  fromIso: string,
  untilIso: string,
): Promise<BoxCutoffRow[]> {
  const { data, error } = await createAdminClient()
    .from("consolidation_boxes")
    .select("id, label, region_code, cutoff_at, departs_at")
    .eq("status", "open")
    .not("cutoff_at", "is", null)
    .gte("cutoff_at", fromIso)
    .lte("cutoff_at", untilIso)
    .order("cutoff_at", { ascending: true });
  if (error) throw new Error(`Failed to load boxes near cutoff: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    label: row.label == null ? null : String(row.label),
    region_code: String(row.region_code),
    cutoff_at: String(row.cutoff_at),
    departs_at: row.departs_at == null ? null : String(row.departs_at),
  }));
}

// ── Recent activity ──────────────────────────────────────────────────────────

export async function listRecentOrders(limit: number): Promise<RecentOrderRow[]> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select(
      "id, product_name, status, origin_country, quantity, needs_review, created_at, admin_total_ghs, pricing",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load recent orders: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    product_name: String(row.product_name),
    status: String(row.status),
    origin_country: String(row.origin_country),
    quantity: numberOr(row.quantity, 1),
    needs_review: row.needs_review === true,
    created_at: String(row.created_at),
    admin_total_ghs: numberOrNull(row.admin_total_ghs),
    pricing_total_ghs: numberOrNull(
      (row.pricing as { total_ghs?: unknown } | null)?.total_ghs,
    ),
  }));
}

/**
 * The most recent settled payments.
 *
 * Successes only. A failed attempt is worth looking at, but it belongs on
 * `/admin/transactions` where it can be read next to its retries — on a "money
 * arrived" card it would read as income.
 */
export async function listRecentSettledPayments(
  limit: number,
): Promise<RecentPaymentRow[]> {
  const { data, error } = await createAdminClient()
    .from("payments")
    .select("id, reference, amount, status, created_at")
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load recent payments: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    reference: String(row.reference),
    amount: numberOr(row.amount, 0),
    status: String(row.status),
    created_at: String(row.created_at),
  }));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Trim the sentinel row back off and report that it was there. */
function cap<T>(rows: T[]): CappedRows<T> {
  return rows.length > DASHBOARD_ROW_CAP
    ? { rows: rows.slice(0, DASHBOARD_ROW_CAP), truncated: true }
    : { rows, truncated: false };
}

/**
 * PostgREST hands NUMERIC back as a string on some drivers and a number on
 * others, and JSONB fields as whatever was written. Coerce once, here, so no
 * total downstream is ever built by adding a string to a number.
 */
function numberOr(value: unknown, fallback: number): number {
  const parsed = numberOrNull(value);
  return parsed ?? fallback;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
