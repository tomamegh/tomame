import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QuoteCheckKind, QuoteCheckOrigin, QuoteCheckStatus } from "@/features/extraction/pay-gate";
import type { ExtractionResult } from "@/features/extraction/types";

/**
 * `quote_checks` (migration 103): the price and stock checks that hold Pay.
 *
 * Service role throughout: RLS is on with no client policy. Who may open,
 * decide or read a check is decided in `quote-checks.service.ts`; this file
 * only reads and writes rows.
 */

export interface QuoteCheckRow {
  id: string;
  kind: QuoteCheckKind;
  origin: QuoteCheckOrigin;
  status: QuoteCheckStatus;
  extraction_cache_id: string;
  product_url: string;
  product_title: string | null;
  platform: string | null;
  quoted_price: number | null;
  quoted_currency: string | null;
  price_source: string | null;
  reasons: string[];
  user_id: string | null;
  session_id: string | null;
  customer_note: string | null;
  reported_price: number | null;
  reread_price: number | null;
  reread_currency: string | null;
  reread_source: string | null;
  reread_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  confirmed_price: number | null;
  substitute_url: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, kind, origin, status, extraction_cache_id, product_url, product_title, platform, quoted_price, quoted_currency, price_source, reasons, user_id, session_id, customer_note, reported_price, reread_price, reread_currency, reread_source, reread_at, decided_by, decided_at, decision_note, confirmed_price, substitute_url, valid_until, created_at, updated_at";

const NUMERIC = ["quoted_price", "reported_price", "reread_price", "confirmed_price"] as const;

/** PostgREST returns NUMERIC as a string; the row type says number. */
function toRow(raw: Record<string, unknown>): QuoteCheckRow {
  const row = { ...raw } as Record<string, unknown>;
  for (const k of NUMERIC) row[k] = row[k] == null ? null : Number(row[k]);
  row.reasons = Array.isArray(row.reasons) ? row.reasons : [];
  return row as unknown as QuoteCheckRow;
}

/** Every check for these extractions, newest first. */
export async function listQuoteChecksForExtractions(ids: readonly string[]): Promise<QuoteCheckRow[]> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("quote_checks")
    .select(COLUMNS)
    .in("extraction_cache_id", wanted)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Failed to load quote checks: ${error.message}`);
  return (data ?? []).map((r) => toRow(r as Record<string, unknown>));
}

export interface NewQuoteCheck {
  kind: QuoteCheckKind;
  origin: QuoteCheckOrigin;
  status: Extract<QuoteCheckStatus, "checking" | "pending">;
  extraction_cache_id: string;
  product_url: string;
  product_title: string | null;
  platform: string | null;
  quoted_price: number | null;
  quoted_currency: string | null;
  price_source: string | null;
  reasons: string[];
  user_id: string | null;
  session_id: string | null;
  customer_note?: string | null;
  reported_price?: number | null;
}

/**
 * Insert a check. Null when an equivalent open check already exists (the
 * partial unique indexes of 103), so the caller knows it did not open one and
 * must not alert staff again.
 */
export async function insertQuoteCheck(input: NewQuoteCheck): Promise<QuoteCheckRow | null> {
  const { data, error } = await createAdminClient()
    .from("quote_checks")
    .insert({ ...input, session_id: input.user_id ? null : input.session_id })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`Failed to open the check: ${error.message}`);
  }
  return toRow(data as Record<string, unknown>);
}

export async function getQuoteCheck(id: string): Promise<QuoteCheckRow | null> {
  const { data, error } = await createAdminClient().from("quote_checks").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load the check: ${error.message}`);
  return data ? toRow(data as Record<string, unknown>) : null;
}

export type QuoteCheckPatch = Partial<
  Pick<
    QuoteCheckRow,
    | "status"
    | "reread_price"
    | "reread_currency"
    | "reread_source"
    | "reread_at"
    | "decided_by"
    | "decided_at"
    | "decision_note"
    | "confirmed_price"
    | "substitute_url"
    | "valid_until"
    | "reasons"
  >
>;

/**
 * Move a check, guarded on the status the caller saw: two staff acting at once
 * cannot both decide it, and a finished re-read cannot overwrite a staff
 * decision. Null when the guard matched nothing.
 */
export async function updateQuoteCheckFrom(id: string, from: QuoteCheckStatus, patch: QuoteCheckPatch): Promise<QuoteCheckRow | null> {
  const { data, error } = await createAdminClient()
    .from("quote_checks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", from)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to update the check: ${error.message}`);
  return data ? toRow(data as Record<string, unknown>) : null;
}

/** The admin queue: one kind, one status (or every status), oldest first. */
export async function listQuoteCheckQueue(kind: QuoteCheckKind, status?: QuoteCheckStatus): Promise<QuoteCheckRow[]> {
  let query = createAdminClient().from("quote_checks").select(COLUMNS).eq("kind", kind);
  query = status ? query.eq("status", status) : query.neq("status", "checking");
  const { data, error } = await query.order("created_at", { ascending: status === "pending" }).limit(200);
  if (error) throw new Error(`Failed to load the queue: ${error.message}`);
  return (data ?? []).map((r) => toRow(r as Record<string, unknown>));
}

/** Open checks waiting on staff, for the admin nav badge. */
export async function countPendingQuoteChecks(kind: QuoteCheckKind): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("quote_checks")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind)
    .eq("status", "pending");
  if (error) throw new Error(`Failed to count checks: ${error.message}`);
  return count ?? 0;
}

/**
 * A staff price correction, written into the server snapshot every pay path
 * prices from. Guarded on the price the staff member saw, so a re-read that
 * landed meanwhile is not silently overwritten. True when written.
 */
export async function correctSnapshotPrice(
  id: string,
  expectedPrice: number,
  update: (result: ExtractionResult) => ExtractionResult,
): Promise<boolean> {
  const db = createAdminClient();
  const { data, error } = await db.from("extraction_cache").select("result").eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load the quote: ${error.message}`);
  const result = (data as { result: ExtractionResult } | null)?.result;
  if (!result || result.product?.price !== expectedPrice) return false;
  const { data: written, error: writeError } = await db
    .from("extraction_cache")
    .update({ result: update(result), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("result->product->>price", String(expectedPrice))
    .select("id");
  if (writeError) throw new Error(`Failed to correct the price: ${writeError.message}`);
  return (written?.length ?? 0) > 0;
}

/** For the staff alert: one check. */
export async function getStaffQuoteCheck(id: string): Promise<QuoteCheckRow | null> {
  return getQuoteCheck(id);
}
