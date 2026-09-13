import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PricingBreakdown } from "@/lib/pricing";
import type { Viewer } from "@/features/quotes/types";
import type { OriginCountry } from "@/features/orders/types";

// ── Row types ───────────────────────────────────────────────────────────────

export type CartStatus = "open" | "checked_out" | "abandoned" | "merged";

export interface CartRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  status: CartStatus;
  delivery_zone_id: string | null;
  delivery_address_id: string | null;
  order_group_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CartItemRow {
  id: string;
  cart_id: string;
  extraction_cache_id: string;
  quantity: number;
  special_instructions: string | null;
  gap_price_usd: number | null;
  gap_origin_country: OriginCountry | null;
  /** Add-to-bag-time breakdown. Informational; every render re-prices. */
  pricing: PricingBreakdown | null;
  quote_lock_id: string | null;
  consolidation_box_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CartItemInsert {
  cart_id: string;
  extraction_cache_id: string;
  quantity: number;
  special_instructions: string | null;
  gap_price_usd: number | null;
  gap_origin_country: OriginCountry | null;
  pricing: PricingBreakdown | null;
  quote_lock_id: string | null;
}

const CART_COLUMNS = "id, user_id, session_id, status, delivery_zone_id, delivery_address_id, order_group_id, created_at, updated_at";
const ITEM_COLUMNS =
  "id, cart_id, extraction_cache_id, quantity, special_instructions, gap_price_usd, gap_origin_country, pricing, quote_lock_id, consolidation_box_id, created_at, updated_at";

// ── Carts (service role — every write is the server's) ──────────────────────

/**
 * The viewer's open cart. A signed-in viewer is matched by user_id; an
 * anonymous one by session_id AND no owner — an adopted cart belongs to the
 * user, not to whoever still holds the cookie.
 */
export async function findOpenCart(viewer: Viewer): Promise<CartRow | null> {
  const client = createAdminClient();
  let query = client.from("carts").select(CART_COLUMNS).eq("status", "open").limit(1);
  if (viewer.userId) query = query.eq("user_id", viewer.userId);
  else if (viewer.sessionId) query = query.eq("session_id", viewer.sessionId).is("user_id", null);
  else return null;

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to load cart: ${error.message}`);
  return data ? normalizeCart(data) : null;
}

/** The open cart still owned by an anonymous session, if any. */
export async function findOpenSessionCart(sessionId: string): Promise<CartRow | null> {
  return findOpenCart({ userId: null, sessionId });
}

export async function insertCart(viewer: Viewer): Promise<CartRow> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("carts")
    .insert({ user_id: viewer.userId, session_id: viewer.sessionId, status: "open" })
    .select(CART_COLUMNS)
    .single();
  if (error) throw new Error(`Failed to create cart: ${error.message}`);
  return normalizeCart(data);
}

/** Give an anonymous cart to a user. Guarded on `user_id IS NULL`; returns whether a row changed. */
export async function adoptCart(cartId: string, userId: string): Promise<boolean> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("carts")
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .eq("id", cartId)
    .eq("status", "open")
    .is("user_id", null)
    .select("id");
  if (error) throw new Error(`Failed to adopt cart: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function setCartStatus(cartId: string, from: CartStatus, to: CartStatus, patch: Partial<Pick<CartRow, "order_group_id" | "delivery_address_id" | "delivery_zone_id">> = {}): Promise<boolean> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("carts")
    .update({ status: to, updated_at: new Date().toISOString(), ...patch })
    .eq("id", cartId)
    .eq("status", from)
    .select("id");
  if (error) throw new Error(`Failed to update cart: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Remember where the bag goes. Callers null the column they are not setting — a cart holds one choice. */
export async function updateCart(cartId: string, patch: Partial<Pick<CartRow, "delivery_address_id" | "delivery_zone_id">>): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.from("carts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", cartId);
  if (error) throw new Error(`Failed to update cart: ${error.message}`);
}

export async function touchCart(cartId: string): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.from("carts").update({ updated_at: new Date().toISOString() }).eq("id", cartId);
  if (error) throw new Error(`Failed to touch cart: ${error.message}`);
}

// ── Lines ───────────────────────────────────────────────────────────────────

export async function listCartItems(cartId: string): Promise<CartItemRow[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("cart_items")
    .select(ITEM_COLUMNS)
    .eq("cart_id", cartId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load cart items: ${error.message}`);
  return (data ?? []).map(normalizeItem);
}

export async function findCartItem(cartId: string, extractionCacheId: string): Promise<CartItemRow | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("cart_items")
    .select(ITEM_COLUMNS)
    .eq("cart_id", cartId)
    .eq("extraction_cache_id", extractionCacheId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load cart item: ${error.message}`);
  return data ? normalizeItem(data) : null;
}

export async function getCartItemById(id: string): Promise<CartItemRow | null> {
  const client = createAdminClient();
  const { data, error } = await client.from("cart_items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load cart item: ${error.message}`);
  return data ? normalizeItem(data) : null;
}

export async function insertCartItem(input: CartItemInsert): Promise<CartItemRow> {
  const client = createAdminClient();
  const { data, error } = await client.from("cart_items").insert(input).select(ITEM_COLUMNS).single();
  if (error) throw new Error(`Failed to add to bag: ${error.message}`);
  return normalizeItem(data);
}

export async function updateCartItem(
  id: string,
  patch: Partial<Pick<CartItemRow, "quantity" | "special_instructions" | "gap_price_usd" | "gap_origin_country" | "pricing" | "quote_lock_id" | "consolidation_box_id">>,
): Promise<CartItemRow | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("cart_items")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(ITEM_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to update bag line: ${error.message}`);
  return data ? normalizeItem(data) : null;
}

export async function deleteCartItem(id: string): Promise<boolean> {
  const client = createAdminClient();
  const { data, error } = await client.from("cart_items").delete().eq("id", id).select("id");
  if (error) throw new Error(`Failed to remove bag line: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Move every line of one cart into another, summing quantities on the same product. */
export async function moveCartItems(fromCartId: string, toCartId: string): Promise<number> {
  const source = await listCartItems(fromCartId);
  if (source.length === 0) return 0;
  const target = await listCartItems(toCartId);
  const byProduct = new Map(target.map((t) => [t.extraction_cache_id, t]));
  for (const line of source) {
    const existing = byProduct.get(line.extraction_cache_id);
    if (existing) {
      await updateCartItem(existing.id, { quantity: Math.min(100, existing.quantity + line.quantity) });
      await deleteCartItem(line.id);
    } else {
      const client = createAdminClient();
      const { error } = await client.from("cart_items").update({ cart_id: toCartId, updated_at: new Date().toISOString() }).eq("id", line.id);
      if (error) throw new Error(`Failed to merge bag: ${error.message}`);
    }
  }
  return source.length;
}

/** `sum(quantity)` over the viewer's open cart — the nav badge. */
export async function countBagItems(viewer: Viewer): Promise<number> {
  const cart = await findOpenCart(viewer);
  if (!cart) return 0;
  const client = createAdminClient();
  const { data, error } = await client.from("cart_items").select("quantity").eq("cart_id", cart.id);
  if (error) throw new Error(`Failed to count bag: ${error.message}`);
  return (data ?? []).reduce((sum, r) => sum + Number(r.quantity ?? 0), 0);
}

// ── Row normalisation (PostgREST returns NUMERIC as strings) ────────────────

function normalizeCart(row: Record<string, unknown>): CartRow {
  return {
    id: String(row.id),
    user_id: (row.user_id as string | null) ?? null,
    session_id: (row.session_id as string | null) ?? null,
    status: row.status as CartStatus,
    delivery_zone_id: (row.delivery_zone_id as string | null) ?? null,
    delivery_address_id: (row.delivery_address_id as string | null) ?? null,
    order_group_id: (row.order_group_id as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeItem(row: Record<string, unknown>): CartItemRow {
  return {
    id: String(row.id),
    cart_id: String(row.cart_id),
    extraction_cache_id: String(row.extraction_cache_id),
    quantity: Number(row.quantity),
    special_instructions: (row.special_instructions as string | null) ?? null,
    gap_price_usd: row.gap_price_usd == null ? null : Number(row.gap_price_usd),
    gap_origin_country: (row.gap_origin_country as OriginCountry | null) ?? null,
    pricing: (row.pricing as PricingBreakdown | null) ?? null,
    quote_lock_id: (row.quote_lock_id as string | null) ?? null,
    consolidation_box_id: (row.consolidation_box_id as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
