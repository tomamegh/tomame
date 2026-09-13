import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getQuoteFacts } from "@/db/queries/extraction-cache";
import { logger } from "@/lib/logger";
import type { CartItemRow, CartRow, CartStatus } from "@/db/queries/carts";

/**
 * Bag reads for the admin console (migration 048).
 *
 * WHY THIS IS NOT `getBag`. `bag.service.ts`'s `getBag` is the CUSTOMER's read:
 * it re-prices every line from the live extraction snapshot under the viewer's
 * rate lock, because the customer is about to be charged what it returns. Doing
 * that for a list of every open bag in the system would mean an FX read, a
 * pricing-constants load and a calculator run per line, on a screen nobody is
 * paying from. So this module never prices anything: every figure it returns is
 * read straight out of `cart_items.pricing`, the breakdown that was stored when
 * the line was added.
 *
 * That makes the money on this screen a SNAPSHOT, and the screens that render it
 * say so in words. Showing a stored figure as though it were a live quote is the
 * failure this comment exists to prevent — the customer's own bag re-prices on
 * every render, so the two will differ whenever a rate or a constant has moved.
 *
 * `db/queries/**` is data access only. Summing stored numbers to give a list row
 * a value is shaping, not pricing — the same liberty `countBagItems` takes in
 * `carts.ts`. Nothing here applies a fee, a rate or a rule.
 */

// ── Row types ───────────────────────────────────────────────────────────────

/**
 * What a bag line is waiting on, if anything.
 *
 * `reading` and `failed` are the paste queue's states (049): a line can be added
 * to a bag before its price exists, and it then names an `extraction_request`
 * rather than a cache row. `unpriced` is the line that HAS a product but whose
 * listing carried no price — a readable page is not a quote. `expired` is a
 * cache row that has aged out from under a bag that has been sitting too long.
 */
export type AdminBagLineState = "priced" | "unpriced" | "reading" | "failed" | "expired";

export interface AdminBagLine {
  id: string;
  /** The listing's own title, when the extraction produced one. */
  title: string | null;
  product_url: string | null;
  quantity: number;
  /**
   * `cart_items.pricing.total_ghs` verbatim — the add-to-bag snapshot, already
   * inclusive of quantity. Null on a line that has never been priced.
   */
  snapshot_total_ghs: number | null;
  state: AdminBagLineState;
  created_at: string;
}

export interface AdminBagOwner {
  /** A signed-in customer, or a visitor known only by their `tm_quote_session` cookie. */
  kind: "customer" | "anonymous";
  user_id: string | null;
  name: string | null;
  email: string | null;
  session_id: string | null;
}

export interface AdminBagRow {
  id: string;
  status: CartStatus;
  owner: AdminBagOwner;
  line_count: number;
  /** `sum(quantity)` — how many physical things are in the bag. */
  item_count: number;
  /** Σ of the priced lines' stored totals. A SNAPSHOT, never a live quote. */
  snapshot_value_ghs: number;
  /** Lines carrying a stored total; the rest contribute nothing to the value above. */
  priced_line_count: number;
  /** Lines still being read, failed, expired or unpriced — the bag cannot check out. */
  blocked_line_count: number;
  created_at: string;
  updated_at: string;
  lines: AdminBagLine[];
}

export interface AdminBagFilters {
  /** Defaults to `open` — the only status that is a live signal rather than history. */
  status?: CartStatus;
  limit?: number;
}

export const ADMIN_BAGS_PAGE_SIZE = 60;

// ── List ────────────────────────────────────────────────────────────────────

/**
 * Open bags, most recently touched first.
 *
 * Ordered by `updated_at` rather than `created_at` because the question this
 * screen answers is "who is shopping", and an old cart somebody added to this
 * morning is live demand while a cart created this morning and untouched since
 * is not. The age an admin acts on — "has this been sitting long enough to
 * nudge?" — is computed from `updated_at` by the screen.
 */
export async function listAdminBags(filters: AdminBagFilters = {}): Promise<AdminBagRow[]> {
  const db = createAdminClient();
  const status = filters.status ?? "open";

  const { data, error } = await db
    .from("carts")
    .select(
      "id, user_id, session_id, status, delivery_zone_id, delivery_address_id, order_group_id, created_at, updated_at",
    )
    .eq("status", status)
    .order("updated_at", { ascending: false })
    .limit(filters.limit ?? ADMIN_BAGS_PAGE_SIZE);

  if (error) throw new Error(`Failed to load bags: ${error.message}`);

  const carts = (data ?? []) as CartRow[];
  if (carts.length === 0) return [];

  // Three fan-out reads for the whole page, never one per bag: the lines, the
  // owners, and what the extractor has made of each line's paste.
  const lines = await listLinesForCarts(carts.map((cart) => cart.id));
  const [owners, facts] = await Promise.all([
    resolveOwners(carts),
    describeLineProducts(lines),
  ]);

  return carts
    .map((cart) => buildBagRow(cart, lines.get(cart.id) ?? [], owners, facts))
    .filter((bag) => bag.line_count > 0);
}

// ── Assembly ────────────────────────────────────────────────────────────────

function buildBagRow(
  cart: CartRow,
  lines: CartItemRow[],
  owners: Map<string, { name: string | null; email: string | null }>,
  facts: Map<string, LineProduct>,
): AdminBagRow {
  const described = lines.map((line) => describeLine(line, facts));
  const priced = described.filter((line) => line.snapshot_total_ghs != null);

  const ownerProfile = cart.user_id ? owners.get(cart.user_id) : undefined;

  return {
    id: cart.id,
    status: cart.status,
    owner: {
      kind: cart.user_id ? "customer" : "anonymous",
      user_id: cart.user_id,
      name: ownerProfile?.name ?? null,
      email: ownerProfile?.email ?? null,
      session_id: cart.session_id,
    },
    line_count: described.length,
    item_count: described.reduce((sum, line) => sum + line.quantity, 0),
    snapshot_value_ghs:
      Math.round(priced.reduce((sum, line) => sum + (line.snapshot_total_ghs ?? 0), 0) * 100) /
      100,
    priced_line_count: priced.length,
    blocked_line_count: described.filter((line) => line.state !== "priced").length,
    created_at: cart.created_at,
    updated_at: cart.updated_at,
    lines: described,
  };
}

function describeLine(line: CartItemRow, facts: Map<string, LineProduct>): AdminBagLine {
  const product = line.extraction_cache_id ? facts.get(line.extraction_cache_id) : undefined;
  const request = line.extraction_request_id
    ? facts.get(`request:${line.extraction_request_id}`)
    : undefined;
  const known = product ?? request;

  return {
    id: line.id,
    title: known?.title ?? null,
    product_url: known?.product_url ?? null,
    quantity: line.quantity,
    snapshot_total_ghs: line.pricing?.total_ghs ?? null,
    state: resolveLineState(line, product, request),
    created_at: line.created_at,
  };
}

/**
 * The state ladder, most specific first.
 *
 * A line with no cache row at all is still in the paste queue, so its state is
 * the JOB's — `reading` while it runs, `failed` when the extractor gave up. Once
 * it has a cache row, the questions are the ones `getQuoteFacts` answers, and in
 * its order: is the row still usable, and does it carry a price. We do not treat
 * "the line has a stored breakdown" as proof of anything — a bag that sat through
 * a cache expiry has stored totals for products that can no longer be quoted.
 */
function resolveLineState(
  line: CartItemRow,
  product: LineProduct | undefined,
  request: LineProduct | undefined,
): AdminBagLineState {
  if (!line.extraction_cache_id) {
    if (request?.job_status === "failed") return "failed";
    return "reading";
  }
  if (!product) return "expired";
  if (!product.usable) return "expired";
  if (!product.priced) return "unpriced";
  return line.pricing ? "priced" : "unpriced";
}

// ── Reads ───────────────────────────────────────────────────────────────────

async function listLinesForCarts(cartIds: string[]): Promise<Map<string, CartItemRow[]>> {
  const byCart = new Map<string, CartItemRow[]>();
  if (cartIds.length === 0) return byCart;

  const db = createAdminClient();
  const { data, error } = await db
    .from("cart_items")
    .select(
      "id, cart_id, extraction_cache_id, extraction_request_id, quantity, special_instructions, gap_price_usd, gap_origin_country, pricing, quote_lock_id, consolidation_box_id, created_at, updated_at",
    )
    .in("cart_id", cartIds)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load bag lines: ${error.message}`);

  for (const raw of (data ?? []) as Record<string, unknown>[]) {
    const line = {
      ...(raw as unknown as CartItemRow),
      quantity: Number(raw.quantity),
    };
    const list = byCart.get(line.cart_id);
    if (list) list.push(line);
    else byCart.set(line.cart_id, [line]);
  }
  return byCart;
}

/** What we can say about the product behind one line, from either of its two sources. */
interface LineProduct {
  title: string | null;
  product_url: string | null;
  usable: boolean;
  priced: boolean;
  /** Only for a line still named by its paste: the extraction job's own status. */
  job_status?: string;
}

/**
 * Titles, URLs and quote facts for every line on the page.
 *
 * The validity rule is NOT restated here — `getQuoteFacts` owns it, and the
 * paste queue learned the hard way that a second spelling of "is this quote
 * usable" ends up disagreeing with the first.
 */
async function describeLineProducts(
  linesByCart: Map<string, CartItemRow[]>,
): Promise<Map<string, LineProduct>> {
  const lines = [...linesByCart.values()].flat();
  const cacheIds = [
    ...new Set(lines.map((line) => line.extraction_cache_id).filter((id): id is string => !!id)),
  ];
  const requestIds = [
    ...new Set(
      lines.map((line) => line.extraction_request_id).filter((id): id is string => !!id),
    ),
  ];

  const db = createAdminClient();
  const [facts, cacheRows, requestRows] = await Promise.all([
    getQuoteFacts(cacheIds),
    cacheIds.length
      ? db.from("extraction_cache").select("id, product_url").in("id", cacheIds)
      : Promise.resolve({ data: [], error: null }),
    requestIds.length
      ? db
          .from("extraction_requests")
          .select("id, product_url, status")
          .in("id", requestIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const products = new Map<string, LineProduct>();

  if (cacheRows.error) {
    logger.warn("admin bag product urls failed", { message: cacheRows.error.message });
  }
  const urls = new Map(
    ((cacheRows.data ?? []) as { id: string; product_url: string }[]).map((row) => [
      row.id,
      row.product_url,
    ]),
  );
  for (const id of cacheIds) {
    const fact = facts.get(id);
    products.set(id, {
      title: fact?.title ?? null,
      product_url: urls.get(id) ?? null,
      usable: fact?.usable ?? false,
      priced: fact?.priced ?? false,
    });
  }

  if (requestRows.error) {
    logger.warn("admin bag paste states failed", { message: requestRows.error.message });
  }
  for (const row of (requestRows.data ?? []) as {
    id: string;
    product_url: string;
    status: string;
  }[]) {
    products.set(`request:${row.id}`, {
      title: null,
      product_url: row.product_url,
      usable: false,
      priced: false,
      job_status: row.status,
    });
  }

  return products;
}

/** Names and emails for the signed-in owners on the page, in two queries rather than 2N. */
async function resolveOwners(
  carts: readonly CartRow[],
): Promise<Map<string, { name: string | null; email: string | null }>> {
  const owners = new Map<string, { name: string | null; email: string | null }>();
  const userIds = [...new Set(carts.map((cart) => cart.user_id).filter((id): id is string => !!id))];
  if (userIds.length === 0) return owners;

  const db = createAdminClient();
  const { data, error } = await db
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", userIds);

  if (error) {
    logger.warn("admin bag owners failed", { message: error.message });
    return owners;
  }

  for (const row of (data ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
  }[]) {
    const name = [row.first_name, row.last_name]
      .filter((part): part is string => !!part?.trim())
      .join(" ")
      .trim();
    owners.set(row.id, { name: name || null, email: null });
  }

  // Emails live in `auth.users` and cost ONE CALL EACH — there is no bulk read
  // by id — so they are fetched only for the owners whose profile carries no
  // name, which is the only case where the screen has nothing else to call them.
  // Fetching all of them would mean sixty auth round trips to render a list
  // whose owner column would have looked identical.
  const nameless = userIds.filter((id) => !owners.get(id)?.name);
  await Promise.all(
    nameless.map(async (id) => {
      const { data: auth } = await db.auth.admin.getUserById(id);
      owners.set(id, { name: null, email: auth?.user?.email ?? null });
    }),
  );

  return owners;
}
