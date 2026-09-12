import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PricingBreakdown } from "@/lib/pricing";
import type { Viewer } from "@/features/quotes/types";

// ── Row types ───────────────────────────────────────────────────────────────

export interface QuoteLockRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  extraction_cache_id: string | null;
  quantity: number;
  /** Buffered USD→GHS rate the customer is charged at. */
  exchange_rate: number;
  mid_market_rate: number;
  /** Every X→GHS mid-market rate at mint, keyed by currency (USD included). */
  fx_rates: Record<string, number>;
  /**
   * Informational mint-time snapshot of the breakdown the customer saw. It may
   * carry a customer-supplied gap-filler price and is NEVER read as a price
   * source — the item price always comes from the live extraction snapshot.
   */
  pricing: PricingBreakdown;
  locked_at: string;
  expires_at: string;
  consumed_by_order_id: string | null;
  consumed_at: string | null;
  created_at: string;
}

export interface QuoteLockInsert {
  user_id: string | null;
  session_id: string | null;
  extraction_cache_id: string;
  quantity: number;
  exchange_rate: number;
  mid_market_rate: number;
  fx_rates: Record<string, number>;
  pricing: PricingBreakdown;
  locked_at: string;
  expires_at: string;
}

export interface LockRates {
  exchange_rate: number;
  mid_market_rate: number;
  fx_rates: Record<string, number>;
}

const COLUMNS =
  "id, user_id, session_id, extraction_cache_id, quantity, exchange_rate, mid_market_rate, fx_rates, pricing, locked_at, expires_at, consumed_by_order_id, consumed_at, created_at";

// ── Queries (service role — every write to this table is the server's) ──────

/**
 * The viewer's newest unexpired, unconsumed lock on one extraction. A signed-in
 * viewer is matched by user_id; an anonymous one by session_id AND no owner —
 * a lock that has been adopted belongs to the user, not to whoever still holds
 * the cookie. Adoption (in the service layer) runs when the user lookup misses.
 */
export async function findActiveLock(
  viewer: Viewer,
  extractionCacheId: string,
  nowIso: string,
): Promise<QuoteLockRow | null> {
  const client = createAdminClient();
  let query = client
    .from("quote_locks")
    .select(COLUMNS)
    .eq("extraction_cache_id", extractionCacheId)
    .gt("expires_at", nowIso)
    .is("consumed_by_order_id", null)
    .order("expires_at", { ascending: false })
    .limit(1);

  if (viewer.userId) query = query.eq("user_id", viewer.userId);
  else if (viewer.sessionId) query = query.eq("session_id", viewer.sessionId).is("user_id", null);
  else return null;

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to load quote lock: ${error.message}`);
  return data ? normalizeRow(data) : null;
}

/** One lock by id, consumed or not — the admin re-price reads the order's lock this way. */
export async function getQuoteLockById(id: string): Promise<QuoteLockRow | null> {
  const client = createAdminClient();
  const { data, error } = await client.from("quote_locks").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load quote lock: ${error.message}`);
  return data ? normalizeRow(data) : null;
}

export async function insertQuoteLock(input: QuoteLockInsert): Promise<QuoteLockRow> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("quote_locks")
    .insert(input)
    .select(COLUMNS)
    .single();

  if (error) throw new Error(`Failed to create quote lock: ${error.message}`);
  return normalizeRow(data);
}

/**
 * Overwrite the frozen FX with a lower one. expires_at is deliberately
 * untouched. Guarded so two concurrent ratchets — or a stale caller — can never
 * move a lock's rate UP: only a row whose exchange_rate is still above the new
 * one is touched. Returns whether a row changed.
 */
export async function ratchetLockRate(id: string, rates: LockRates): Promise<boolean> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("quote_locks")
    .update({ exchange_rate: rates.exchange_rate, mid_market_rate: rates.mid_market_rate, fx_rates: rates.fx_rates })
    .eq("id", id)
    .gt("exchange_rate", rates.exchange_rate)
    .select("id");

  if (error) throw new Error(`Failed to ratchet quote lock: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Give every anonymous lock of a session to a user. Returns the ids adopted. */
export async function adoptSessionLocks(sessionId: string, userId: string): Promise<string[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("quote_locks")
    .update({ user_id: userId })
    .eq("session_id", sessionId)
    .is("user_id", null)
    .select("id");

  if (error) throw new Error(`Failed to adopt quote locks: ${error.message}`);
  return (data ?? []).map((row) => String(row.id));
}

/** Mark one lock spent, only if nobody else has. Returns how many rows changed (0 or 1). */
export async function consumeLock(id: string, orderId: string, nowIso: string): Promise<number> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("quote_locks")
    .update({ consumed_by_order_id: orderId, consumed_at: nowIso })
    .eq("id", id)
    .is("consumed_by_order_id", null)
    .select("id");

  if (error) throw new Error(`Failed to consume quote lock: ${error.message}`);
  return (data ?? []).length;
}

/**
 * Mark EVERY unexpired, unconsumed lock this viewer holds on one extraction as
 * spent by the order — the one it was priced under and any sibling a racy
 * double-mint left behind, so no second usable lock survives the purchase. A
 * signed-in viewer's own locks and the still-anonymous locks of their session
 * cookie are both covered. Returns the ids consumed.
 */
export async function consumeActiveLocks(
  viewer: Viewer,
  extractionCacheId: string,
  orderId: string,
  nowIso: string,
): Promise<string[]> {
  const owners: string[] = [];
  if (viewer.userId) owners.push(`user_id.eq.${viewer.userId}`);
  if (viewer.sessionId) owners.push(`and(session_id.eq.${viewer.sessionId},user_id.is.null)`);
  if (owners.length === 0) return [];

  const client = createAdminClient();
  const { data, error } = await client
    .from("quote_locks")
    .update({ consumed_by_order_id: orderId, consumed_at: nowIso })
    .eq("extraction_cache_id", extractionCacheId)
    .gt("expires_at", nowIso)
    .is("consumed_by_order_id", null)
    .or(owners.join(","))
    .select("id");

  if (error) throw new Error(`Failed to consume quote locks: ${error.message}`);
  return (data ?? []).map((row) => String(row.id));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** NUMERIC comes back from PostgREST as a string; the calculator needs numbers. */
function normalizeRow(row: Record<string, unknown>): QuoteLockRow {
  return {
    id: String(row.id),
    user_id: row.user_id != null ? String(row.user_id) : null,
    session_id: row.session_id != null ? String(row.session_id) : null,
    extraction_cache_id: row.extraction_cache_id != null ? String(row.extraction_cache_id) : null,
    quantity: Number(row.quantity),
    exchange_rate: Number(row.exchange_rate),
    mid_market_rate: Number(row.mid_market_rate),
    fx_rates: normalizeRates(row.fx_rates),
    pricing: row.pricing as PricingBreakdown,
    locked_at: String(row.locked_at),
    expires_at: String(row.expires_at),
    consumed_by_order_id: row.consumed_by_order_id != null ? String(row.consumed_by_order_id) : null,
    consumed_at: row.consumed_at != null ? String(row.consumed_at) : null,
    created_at: String(row.created_at),
  };
}

function normalizeRates(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value);
    if (Number.isFinite(n)) out[key.toUpperCase()] = n;
  }
  return out;
}
