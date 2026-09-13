import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The rest of a customer, for `/admin/users/[id]`.
 *
 * WHY. The existing user detail endpoint returns an auth user, a profile and
 * ten orders — which was the whole of a customer when it was written. Since
 * then a customer has acquired a bag (048), saved addresses (048), price
 * watches (041) and notification preferences (051), and none of it was
 * reachable from the admin. An admin taking a support call about "the thing in
 * my basket" had no way to see the basket.
 *
 * `profiles.notify_email` / `whatsapp_opt_in` / `phone` (051) are read here
 * rather than through `getUserById` because that function predates them and is
 * on the hot path of several other screens.
 *
 * Service-role client, no auth checks — the caller has already established that
 * it is an admin asking (CLAUDE.md).
 */

// ── Contact + notification preferences ───────────────────────────────────────

export interface AdminUserPreferences {
  /** As the customer typed it. Unverified — see migration 051. */
  phone: string | null;
  whatsapp_opt_in: boolean;
  notify_email: boolean;
}

export async function getUserPreferences(userId: string): Promise<AdminUserPreferences | null> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("phone, whatsapp_opt_in, notify_email")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load notification preferences: ${error.message}`);
  return (data as unknown as AdminUserPreferences) ?? null;
}

// ── The bag ──────────────────────────────────────────────────────────────────

export interface AdminBagLine {
  id: string;
  quantity: number;
  special_instructions: string | null;
  created_at: string;
  /**
   * The product's title, read out of the cached extraction's `result` JSONB —
   * `extraction_cache` stores no title column of its own. Null for a line that
   * is still waiting on its paste (049), which shows its source URL instead.
   */
  product_name: string | null;
  product_url: string | null;
  /**
   * The landed total stored WHEN THE LINE WAS ADDED, in GH₵, or null.
   *
   * Display only, and labelled as such on screen. The bag re-prices on every
   * render because FX and the fee schedule move underneath it, so this figure
   * is a historical record of what the customer was quoted — never a current
   * total, and never something this screen adds up (CLAUDE.md: no pricing
   * arithmetic outside `lib/pricing`).
   */
  quoted_total_ghs: number | null;
}

export interface AdminBag {
  id: string;
  status: string;
  updated_at: string;
  lines: AdminBagLine[];
}

interface CartItemJoinRow {
  id: string;
  quantity: number;
  special_instructions: string | null;
  created_at: string;
  pricing: { total_ghs?: unknown } | null;
  extraction_cache: { product_url: string | null; result: unknown } | null;
  extraction_requests: { product_url: string | null } | null;
}

/**
 * The customer's open bag, with each line's product named.
 *
 * One query with two embeds rather than a fetch-then-loop: a bag of eight lines
 * would otherwise be nine round trips on a page that already does five.
 */
export async function getOpenBagForUser(userId: string): Promise<AdminBag | null> {
  const db = createAdminClient();

  const { data: cart, error: cartError } = await db
    .from("carts")
    .select("id, status, updated_at")
    .eq("user_id", userId)
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cartError) throw new Error(`Failed to load bag: ${cartError.message}`);
  if (!cart) return null;

  const { data: items, error: itemsError } = await db
    .from("cart_items")
    .select(
      "id, quantity, special_instructions, created_at, pricing, " +
        "extraction_cache(product_url, result), extraction_requests(product_url)",
    )
    .eq("cart_id", (cart as { id: string }).id)
    .order("created_at");

  if (itemsError) throw new Error(`Failed to load bag lines: ${itemsError.message}`);

  const lines: AdminBagLine[] = ((items ?? []) as unknown as CartItemJoinRow[]).map((row) => ({
    id: row.id,
    quantity: row.quantity,
    special_instructions: row.special_instructions,
    created_at: row.created_at,
    product_name: readCachedTitle(row.extraction_cache?.result),
    product_url:
      row.extraction_cache?.product_url ?? row.extraction_requests?.product_url ?? null,
    quoted_total_ghs: readNumber(row.pricing?.total_ghs),
  }));

  const row = cart as { id: string; status: string; updated_at: string };
  return { id: row.id, status: row.status, updated_at: row.updated_at, lines };
}

// ── Watches ──────────────────────────────────────────────────────────────────

export interface AdminUserWatch {
  id: string;
  product_url: string;
  product_name: string | null;
  last_price_usd: number | null;
  last_checked_at: string | null;
  consecutive_failures: number;
  notify_on_drop: boolean;
  notified_at: string | null;
  is_active: boolean;
}

/**
 * Every watch this customer has, active AND inactive.
 *
 * Unlike `listActiveWatchesByUser`, which powers the customer's own card and
 * filters to active, the admin needs the retired ones too — a watch that
 * stopped being checked is exactly the thing a customer rings up about.
 */
export async function listWatchesForUser(userId: string): Promise<AdminUserWatch[]> {
  const { data, error } = await createAdminClient()
    .from("price_watches")
    .select(
      "id, product_url, product_name, last_price_usd, last_checked_at, " +
        "consecutive_failures, notify_on_drop, notified_at, is_active",
    )
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load price watches: ${error.message}`);
  return (data ?? []) as unknown as AdminUserWatch[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * `extraction_cache.result.product.title`, defensively.
 *
 * The column is JSONB and rows written by older resolver versions are still in
 * there, so every hop is checked. A bag line whose title cannot be read shows
 * its URL — never the string "undefined", and never a placeholder name.
 */
function readCachedTitle(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const product = (result as { product?: unknown }).product;
  if (!product || typeof product !== "object") return null;
  const title = (product as { title?: unknown }).title;
  return typeof title === "string" && title.length > 0 ? title : null;
}
