import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reads for the admin money screens — transactions and the pricing console.
 *
 * WHY A FILE OF ITS OWN. The transactions screen used to be assembled by
 * `features/transactions/services`, which answered the pre-048 question: one
 * payment, one order. Since 048 a checkout is an `order_groups` row and a
 * single Paystack transaction can buy several orders, so a screen that renders
 * "the linked order" is now wrong — it silently hides the other lines the
 * customer paid for. These queries return the group and everything in it.
 *
 * `db/queries/**` is data access only: no business logic, no auth checks, no
 * money arithmetic. Amounts come back exactly as the columns hold them —
 * `payments.amount` in pesewas, `order_groups.total_ghs` in cedis — and the
 * display layer is the only place the two are ever spelled differently.
 */

// ── Row types ────────────────────────────────────────────────────────────────

export type AdminPaymentStatus = "pending" | "success" | "failed";

/** The customer's name as `profiles` holds it. Email lives on `auth.users`. */
export interface AdminMoneyCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  /** Only resolved on the detail read — the list does not fan out to auth. */
  email: string | null;
}

export interface AdminTransactionRow {
  id: string;
  reference: string;
  /** Pesewas. Paystack's unit, stored unconverted. */
  amount: number;
  currency: string;
  status: AdminPaymentStatus;
  channel: string | null;
  order_group_id: string | null;
  created_at: string;
  customer: AdminMoneyCustomer | null;
  /** How many orders this transaction bought. 0 when nothing is linked yet. */
  order_count: number;
}

/** One line of the group, as the detail screen lists it. */
export interface AdminTransactionOrderRow {
  id: string;
  product_name: string;
  product_image_url: string | null;
  status: string;
  origin_country: string;
  quantity: number;
  /** The order's own landed total in GHS, from its frozen `pricing` snapshot. */
  total_ghs: number | null;
}

/** The `order_groups` row this payment settles — null for a pre-048 payment. */
export interface AdminTransactionGroup {
  id: string;
  status: string;
  item_count: number;
  subtotal_usd: number;
  tax_usd: number;
  fee_usd: number;
  freight_ghs: number;
  consolidation_saving_ghs: number;
  delivery_fee_ghs: number;
  total_ghs: number;
  /** What Paystack was asked for. Compared against `payments.amount` on screen. */
  total_pesewas: number;
  created_at: string;
}

export interface AdminTransactionDetail {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: AdminPaymentStatus;
  channel: string | null;
  created_at: string;
  customer: AdminMoneyCustomer | null;
  group: AdminTransactionGroup | null;
  orders: AdminTransactionOrderRow[];
  /**
   * The raw `data` object Paystack returned the last time this reference was
   * verified, stored by `handlePaymentCallback`. Absent until something has
   * actually verified — a pending payment has never been confirmed by anyone,
   * and the screen must say exactly that rather than implying a check ran.
   */
  paystack_verification: Record<string, unknown> | null;
}

// ── Transactions ─────────────────────────────────────────────────────────────

const PAYMENT_COLUMNS =
  "id, user_id, reference, amount, currency, status, channel, order_group_id, created_at";

type ProfileJoin = {
  id: string;
  first_name: string | null;
  last_name: string | null;
} | null;

/**
 * Every transaction, newest first, with the customer's name and a count of the
 * orders it bought.
 *
 * The order count is a second round trip rather than a PostgREST aggregate
 * because a legacy payment reaches its order through `metadata->>order_id`
 * instead of `orders.order_group_id`, and one embedded count cannot express
 * both shapes. `limit` keeps the page bounded; the screen says when it is
 * showing a window rather than the whole ledger.
 */
export async function listAdminTransactions(limit = 200): Promise<AdminTransactionRow[]> {
  const client = createAdminClient();

  const { data, error } = await client
    .from("payments")
    .select(`${PAYMENT_COLUMNS}, profiles (id, first_name, last_name)`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load transactions: ${error.message}`);

  const rows = (data ?? []) as unknown as (Record<string, unknown> & { profiles: ProfileJoin })[];

  const groupIds = rows
    .map((r) => r.order_group_id as string | null)
    .filter((id): id is string => id != null);

  const countByGroup = new Map<string, number>();
  if (groupIds.length > 0) {
    const { data: orderRows, error: orderError } = await client
      .from("orders")
      .select("order_group_id")
      .in("order_group_id", groupIds);

    if (orderError) throw new Error(`Failed to count group orders: ${orderError.message}`);

    for (const row of orderRows ?? []) {
      const gid = row.order_group_id as string;
      countByGroup.set(gid, (countByGroup.get(gid) ?? 0) + 1);
    }
  }

  return rows.map((row) => {
    const groupId = (row.order_group_id as string | null) ?? null;
    const profile = row.profiles;
    return {
      id: row.id as string,
      reference: row.reference as string,
      amount: Number(row.amount),
      currency: row.currency as string,
      status: row.status as AdminPaymentStatus,
      channel: (row.channel as string | null) ?? null,
      order_group_id: groupId,
      created_at: row.created_at as string,
      customer: profile
        ? { id: profile.id, first_name: profile.first_name, last_name: profile.last_name, email: null }
        : null,
      // A pre-048 payment has no group, so it has no group order count. The
      // screen shows "—" there rather than a zero that would read as "bought
      // nothing".
      order_count: groupId ? (countByGroup.get(groupId) ?? 0) : 0,
    };
  });
}

/**
 * One transaction, the group it settles, and every order in that group.
 *
 * Falls back to the pre-048 link (`payments.metadata->>order_id`, or
 * `orders.payment_id`) so an old transaction still shows what it bought.
 */
export async function getAdminTransaction(id: string): Promise<AdminTransactionDetail | null> {
  const client = createAdminClient();

  const { data, error } = await client
    .from("payments")
    .select(`${PAYMENT_COLUMNS}, metadata, profiles (id, first_name, last_name)`)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load transaction: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as Record<string, unknown> & { profiles: ProfileJoin };
  const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
  const groupId = (row.order_group_id as string | null) ?? null;

  // ── The group ──────────────────────────────────────────────────────────────
  let group: AdminTransactionGroup | null = null;
  if (groupId) {
    const { data: groupRow, error: groupError } = await client
      .from("order_groups")
      .select(
        "id, status, item_count, subtotal_usd, tax_usd, fee_usd, freight_ghs, consolidation_saving_ghs, delivery_fee_ghs, total_ghs, total_pesewas, created_at",
      )
      .eq("id", groupId)
      .maybeSingle();

    if (groupError) throw new Error(`Failed to load order group: ${groupError.message}`);
    if (groupRow) {
      group = {
        id: groupRow.id as string,
        status: groupRow.status as string,
        item_count: Number(groupRow.item_count),
        subtotal_usd: Number(groupRow.subtotal_usd),
        tax_usd: Number(groupRow.tax_usd),
        fee_usd: Number(groupRow.fee_usd),
        freight_ghs: Number(groupRow.freight_ghs),
        consolidation_saving_ghs: Number(groupRow.consolidation_saving_ghs),
        delivery_fee_ghs: Number(groupRow.delivery_fee_ghs),
        total_ghs: Number(groupRow.total_ghs),
        total_pesewas: Number(groupRow.total_pesewas),
        created_at: groupRow.created_at as string,
      };
    }
  }

  // ── The orders ─────────────────────────────────────────────────────────────
  const orderColumns =
    "id, product_name, product_image_url, status, origin_country, quantity, pricing";
  let orderQuery = client.from("orders").select(orderColumns);

  if (groupId) {
    orderQuery = orderQuery.eq("order_group_id", groupId);
  } else {
    const legacyOrderId = metadata.order_id;
    if (typeof legacyOrderId === "string" && legacyOrderId.length > 0) {
      orderQuery = orderQuery.eq("id", legacyOrderId);
    } else {
      orderQuery = orderQuery.eq("payment_id", row.id as string);
    }
  }

  const { data: orderRows, error: orderError } = await orderQuery.order("created_at");
  if (orderError) throw new Error(`Failed to load transaction orders: ${orderError.message}`);

  const orders: AdminTransactionOrderRow[] = (orderRows ?? []).map((o) => {
    const pricing = (o.pricing as Record<string, unknown> | null) ?? null;
    const total = pricing?.total_ghs;
    return {
      id: o.id as string,
      product_name: o.product_name as string,
      product_image_url: (o.product_image_url as string | null) ?? null,
      status: o.status as string,
      origin_country: o.origin_country as string,
      quantity: Number(o.quantity),
      total_ghs: typeof total === "number" ? total : null,
    };
  });

  // ── The customer ───────────────────────────────────────────────────────────
  let customer: AdminMoneyCustomer | null = null;
  if (row.profiles) {
    const profile = row.profiles;
    // `profiles` has no email column; it lives on auth.users and only the
    // service-role admin API can read it.
    const { data: authUser } = await client.auth.admin.getUserById(profile.id);
    customer = {
      id: profile.id,
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: authUser?.user?.email ?? null,
    };
  }

  const verification = metadata.paystack_verification;

  return {
    id: row.id as string,
    reference: row.reference as string,
    amount: Number(row.amount),
    currency: row.currency as string,
    status: row.status as AdminPaymentStatus,
    channel: (row.channel as string | null) ?? null,
    created_at: row.created_at as string,
    customer,
    group,
    orders,
    paystack_verification:
      verification && typeof verification === "object"
        ? (verification as Record<string, unknown>)
        : null,
  };
}

// ── Pricing console ──────────────────────────────────────────────────────────

/** A `pricing_constants` row exactly as migration 027 defines it. */
export interface AdminPricingConstantRow {
  id: string;
  key: string;
  value: number;
  label: string;
  description: string;
  unit: string;
  updated_at: string;
  updated_by: string | null;
}

export async function listPricingConstants(): Promise<AdminPricingConstantRow[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("pricing_constants")
    .select("id, key, value, label, description, unit, updated_at, updated_by")
    .order("key");

  if (error) throw new Error(`Failed to load pricing constants: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    key: row.key as string,
    // NUMERIC comes back as a string over PostgREST; the console compares and
    // formats these, so coerce once here rather than in five components.
    value: Number(row.value),
    label: row.label as string,
    description: row.description as string,
    unit: row.unit as string,
    updated_at: row.updated_at as string,
    updated_by: (row.updated_by as string | null) ?? null,
  }));
}

/** A pricing group plus how many categories currently route to it. */
export interface AdminPricingGroupRow {
  id: string;
  slug: string;
  name: string;
  flat_rate_ghs: number | null;
  flat_rate_expression: string | null;
  value_percentage: number;
  value_percentage_high: number | null;
  value_threshold_usd: number | null;
  default_weight_lbs: number | null;
  requires_weight: boolean;
  is_active: boolean;
  sort_order: number;
  updated_at: string;
  category_count: number;
}

const GROUP_COLUMNS =
  "id, slug, name, flat_rate_ghs, flat_rate_expression, value_percentage, value_percentage_high, value_threshold_usd, default_weight_lbs, requires_weight, is_active, sort_order, updated_at";

/**
 * Every group, active and deactivated alike. A deactivated group that still has
 * categories pointing at it is a live pricing hole, so the console has to be
 * able to see both.
 */
export async function listPricingGroupsWithCounts(): Promise<AdminPricingGroupRow[]> {
  const client = createAdminClient();

  const [groupsRes, mapRes] = await Promise.all([
    client.from("pricing_groups").select(GROUP_COLUMNS).order("sort_order"),
    client.from("category_pricing_map").select("pricing_group_id"),
  ]);

  if (groupsRes.error) throw new Error(`Failed to load pricing groups: ${groupsRes.error.message}`);
  if (mapRes.error) throw new Error(`Failed to load category mappings: ${mapRes.error.message}`);

  const countByGroup = new Map<string, number>();
  for (const row of mapRes.data ?? []) {
    const gid = row.pricing_group_id as string;
    countByGroup.set(gid, (countByGroup.get(gid) ?? 0) + 1);
  }

  return (groupsRes.data ?? []).map((g) => ({
    id: g.id as string,
    slug: g.slug as string,
    name: g.name as string,
    flat_rate_ghs: g.flat_rate_ghs == null ? null : Number(g.flat_rate_ghs),
    flat_rate_expression: (g.flat_rate_expression as string | null) ?? null,
    value_percentage: Number(g.value_percentage),
    value_percentage_high: g.value_percentage_high == null ? null : Number(g.value_percentage_high),
    value_threshold_usd: g.value_threshold_usd == null ? null : Number(g.value_threshold_usd),
    default_weight_lbs: g.default_weight_lbs == null ? null : Number(g.default_weight_lbs),
    requires_weight: Boolean(g.requires_weight),
    is_active: Boolean(g.is_active),
    sort_order: Number(g.sort_order),
    updated_at: g.updated_at as string,
    category_count: countByGroup.get(g.id as string) ?? 0,
  }));
}

export interface AdminCategoryMappingRow {
  id: string;
  tomame_category: string;
  pricing_group_id: string;
  pricing_group_slug: string;
  pricing_group_name: string;
  updated_at: string;
}

export async function listCategoryMappings(): Promise<AdminCategoryMappingRow[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("category_pricing_map")
    .select("id, tomame_category, pricing_group_id, updated_at, pricing_groups!inner (slug, name)")
    .order("tomame_category");

  if (error) throw new Error(`Failed to load category mappings: ${error.message}`);

  const rows = (data ?? []) as unknown as (Record<string, unknown> & {
    pricing_groups: { slug: string; name: string };
  })[];

  return rows.map((row) => ({
    id: row.id as string,
    tomame_category: row.tomame_category as string,
    pricing_group_id: row.pricing_group_id as string,
    pricing_group_slug: row.pricing_groups.slug,
    pricing_group_name: row.pricing_groups.name,
    updated_at: row.updated_at as string,
  }));
}
