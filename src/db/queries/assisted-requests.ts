import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * `assisted_requests` — "we could not read that page, tell us what you want"
 * (migration 049).
 *
 * The escape hatch when extraction gives up. The customer already gave us the
 * link; this adds the half a machine could not get — what they actually want —
 * and a number to reach them on. A buyer works the queue and answers on WhatsApp.
 *
 * Service role throughout. `status`, `handled_by` and `contacted_at` are staff
 * facts, so 049 gives customers read-only RLS and no write policy at all: every
 * write goes through a service that has already decided who may make it.
 */

export type AssistedRequestStatus = "open" | "contacted" | "resolved" | "cancelled";

export interface AssistedRequestRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  extraction_request_id: string | null;
  product_url: string;
  description: string;
  phone: string;
  status: AssistedRequestStatus;
  handled_by: string | null;
  contacted_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, user_id, session_id, extraction_request_id, product_url, description, phone, status, handled_by, contacted_at, note, created_at, updated_at";

export async function insertAssistedRequest(input: {
  userId: string | null;
  sessionId: string | null;
  extractionRequestId: string | null;
  productUrl: string;
  description: string;
  phone: string;
}): Promise<AssistedRequestRow> {
  const { data, error } = await createAdminClient()
    .from("assisted_requests")
    .insert({
      user_id: input.userId,
      session_id: input.userId ? null : input.sessionId,
      extraction_request_id: input.extractionRequestId,
      product_url: input.productUrl,
      description: input.description,
      phone: input.phone,
    })
    .select(COLUMNS)
    .single();

  if (error) throw new Error(`Failed to record the request: ${error.message}`);
  return data as AssistedRequestRow;
}

/**
 * Has this viewer already asked about this exact link?
 *
 * The form is reachable from more than one screen and a customer who does not
 * hear back within the minute will press it again. A second identical row would
 * put the same job in the buyer's queue twice, so the service reuses an open one.
 */
export async function findOpenAssistedRequest(input: {
  userId: string | null;
  sessionId: string | null;
  productUrl: string;
}): Promise<AssistedRequestRow | null> {
  const owner = input.userId
    ? { column: "user_id", value: input.userId }
    : input.sessionId
      ? { column: "session_id", value: input.sessionId }
      : null;
  if (!owner) return null;

  const { data, error } = await createAdminClient()
    .from("assisted_requests")
    .select(COLUMNS)
    .eq(owner.column, owner.value)
    .eq("product_url", input.productUrl)
    .in("status", ["open", "contacted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn("assisted request lookup failed", { message: error.message });
    return null;
  }
  return (data as AssistedRequestRow | null) ?? null;
}

/** The buyer's queue: oldest open first, because someone is waiting on each one. */
export async function listAssistedRequests(status?: AssistedRequestStatus): Promise<AssistedRequestRow[]> {
  let query = createAdminClient().from("assisted_requests").select(COLUMNS);
  if (status) query = query.eq("status", status);

  const { data, error } = await query.order("created_at", { ascending: true }).limit(200);
  if (error) throw new Error(`Failed to load assisted requests: ${error.message}`);
  return (data ?? []) as AssistedRequestRow[];
}

export async function countOpenAssistedRequests(): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("assisted_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  if (error) {
    logger.warn("assisted request count failed", { message: error.message });
    return 0;
  }
  return count ?? 0;
}

/**
 * Move one request along.
 *
 * Guarded on the status it is moving FROM, so two buyers opening the queue at
 * once cannot both claim the same customer — the loser's update matches nothing
 * and returns null. Same idempotency the payment transitions use.
 */
export async function transitionAssistedRequest(input: {
  id: string;
  from: AssistedRequestStatus;
  to: AssistedRequestStatus;
  handledBy: string;
  note?: string | null;
}): Promise<AssistedRequestRow | null> {
  const { data, error } = await createAdminClient()
    .from("assisted_requests")
    .update({
      status: input.to,
      handled_by: input.handledBy,
      ...(input.to === "contacted" && { contacted_at: new Date().toISOString() }),
      ...(input.note !== undefined && { note: input.note }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("status", input.from)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to update the request: ${error.message}`);
  return (data as AssistedRequestRow | null) ?? null;
}

/**
 * Replace what the customer said on a request that is still open.
 *
 * A correction, not a new job. The buyer must see the latest words and the
 * latest number — returning the stale row and dropping the new one would have
 * them shopping for the wrong item and ringing the wrong phone.
 */
export async function reviseAssistedRequest(input: {
  id: string;
  description: string;
  phone: string;
}): Promise<AssistedRequestRow | null> {
  const { data, error } = await createAdminClient()
    .from("assisted_requests")
    .update({ description: input.description, phone: input.phone, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    // Only while it is still open work: once a buyer has resolved it, a late
    // edit would rewrite history rather than change what they act on.
    .in("status", ["open", "contacted"])
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to update the request: ${error.message}`);
  return (data as AssistedRequestRow | null) ?? null;
}
