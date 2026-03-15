import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
import type { DbStaticPriceItem } from "@/types/db";

// ── DB queries ────────────────────────────────────────────────────────────────

async function getAllStaticPrices(
  client: SupabaseClient,
  activeOnly = true,
): Promise<DbStaticPriceItem[]> {
  let query = client
    .from("static_price_list")
    .select("*")
    .order("category")
    .order("sort_order");

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    logger.error("getAllStaticPrices failed", { error: error.message });
    return [];
  }
  return (data ?? []) as DbStaticPriceItem[];
}

async function getStaticPriceById(
  client: SupabaseClient,
  id: string,
): Promise<DbStaticPriceItem | null> {
  const { data, error } = await client
    .from("static_price_list")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    logger.error("getStaticPriceById failed", { id, error: error.message });
    return null;
  }
  return data as DbStaticPriceItem;
}

async function getStaticPricesByCategory(
  client: SupabaseClient,
  category: string,
): Promise<DbStaticPriceItem[]> {
  const { data, error } = await client
    .from("static_price_list")
    .select("*")
    .eq("category", category)
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    logger.error("getStaticPricesByCategory failed", { category, error: error.message });
    return [];
  }
  return (data ?? []) as DbStaticPriceItem[];
}

// ── Matching helpers ─────────────────────────────────────────────────────────

/** Map TomameCategory values to static_price_list categories */
const CATEGORY_TO_STATIC: Record<string, string[]> = {
  "Cell Phones & Accessories": ["iPhone", "Android"],
  "Electronics": ["iPad", "Mac & Laptops", "Audio", "Gaming", "Accessories"],
  "Computers": ["Mac & Laptops"],
  "TV & Video": ["Gaming"],
  "Headphones": ["Audio"],
  "Video Games": ["Gaming"],
  "Wearable Technology": ["Apple Watch"],
  "Watches": ["Apple Watch", "Watches"],
  "Fragrance": ["Fragrance"],
  "Automotive": ["Automotive"],
  "Smart Home": ["Accessories"],
};

/**
 * Tokenise a product title into lowercase words for keyword matching.
 * Strips common noise like punctuation and size suffixes.
 */
function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Check if ALL keywords for a static price entry appear in the title tokens.
 * More keywords = more specific match = higher priority.
 */
function keywordsMatch(titleTokens: string[], keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  return keywords.every((kw) =>
    titleTokens.some((t) => t.includes(kw.toLowerCase())),
  );
}

/**
 * Try to match a scraped product against the static price list.
 * Priority order:
 * 1. SKU/ASIN exact match (highest confidence)
 * 2. Keyword match on title (most specific match wins — most keywords matched)
 * 3. No match → returns null (use dynamic pricing)
 */
async function findMatchingStaticPrice(
  client: SupabaseClient,
  product: {
    title: string | null;
    category: string | null;
    sku?: string | null;
    asin?: string | null;
  },
): Promise<DbStaticPriceItem | null> {
  // Fetch all active static prices (small table, ~80 rows)
  const allItems = await getAllStaticPrices(client, true);
  if (allItems.length === 0) return null;

  // 1. SKU/ASIN exact match
  const identifiers = [product.sku, product.asin].filter(Boolean).map((s) => s!.toLowerCase());
  if (identifiers.length > 0) {
    for (const item of allItems) {
      if (item.skus.some((s) => identifiers.includes(s.toLowerCase()))) {
        return item;
      }
    }
  }

  // 2. Keyword match on title
  if (!product.title) return null;
  const titleTokens = tokenise(product.title);
  if (titleTokens.length === 0) return null;

  // Narrow candidates by category if we can
  let candidates = allItems;
  if (product.category) {
    const staticCategories = CATEGORY_TO_STATIC[product.category];
    if (staticCategories) {
      const filtered = allItems.filter((item) =>
        staticCategories.includes(item.category),
      );
      if (filtered.length > 0) candidates = filtered;
    }
  }

  // Find the best match: entry with most keywords that ALL match
  let bestMatch: DbStaticPriceItem | null = null;
  let bestKeywordCount = 0;

  for (const item of candidates) {
    if (item.keywords.length === 0) continue;
    if (keywordsMatch(titleTokens, item.keywords) && item.keywords.length > bestKeywordCount) {
      bestMatch = item;
      bestKeywordCount = item.keywords.length;
    }
  }

  return bestMatch;
}

// ── Response types ────────────────────────────────────────────────────────────

export interface StaticPriceItemResponse {
  id: string;
  category: string;
  productName: string;
  priceGhs: number;
  priceMinGhs: number | null;
  priceMaxGhs: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface StaticPriceListResponse {
  items: StaticPriceItemResponse[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toResponse(item: DbStaticPriceItem): StaticPriceItemResponse {
  return {
    id: item.id,
    category: item.category,
    productName: item.product_name,
    priceGhs: item.price_ghs,
    priceMinGhs: item.price_min_ghs,
    priceMaxGhs: item.price_max_ghs,
    isActive: item.is_active,
    sortOrder: item.sort_order,
  };
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Get all static prices (optionally including inactive ones for admin).
 */
export async function getAll(
  client: SupabaseClient,
  includeInactive = false,
): Promise<ServiceResult<StaticPriceListResponse>> {
  const items = await getAllStaticPrices(client, !includeInactive);

  return {
    success: true,
    data: { items: items.map(toResponse) },
  };
}

/**
 * Get static prices for a specific category.
 */
export async function getByCategory(
  client: SupabaseClient,
  category: string,
): Promise<ServiceResult<StaticPriceListResponse>> {
  const items = await getStaticPricesByCategory(client, category);

  return {
    success: true,
    data: { items: items.map(toResponse) },
  };
}

/**
 * Look up a static price by ID.
 * Used during order creation when the user selects a static-priced product.
 */
export async function getById(
  id: string,
): Promise<ServiceResult<StaticPriceItemResponse>> {
  const client = createAdminClient();
  const item = await getStaticPriceById(client, id);

  if (!item) {
    return { success: false, error: "Static price not found", status: 404 };
  }

  if (!item.is_active) {
    return { success: false, error: "Static price is no longer active", status: 410 };
  }

  return { success: true, data: toResponse(item) };
}

/**
 * Create a new static price entry (admin only).
 */
export async function create(
  client: SupabaseClient,
  admin: AuthenticatedUser,
  input: {
    category: string;
    productName: string;
    priceGhs: number;
    priceMinGhs?: number | null;
    priceMaxGhs?: number | null;
    sortOrder?: number;
  },
): Promise<ServiceResult<StaticPriceItemResponse>> {
  const { data, error } = await client
    .from("static_price_list")
    .insert({
      category: input.category,
      product_name: input.productName,
      price_ghs: input.priceGhs,
      price_min_ghs: input.priceMinGhs ?? null,
      price_max_ghs: input.priceMaxGhs ?? null,
      sort_order: input.sortOrder ?? 0,
      updated_by: admin.id,
    })
    .select()
    .single();

  if (error) {
    logger.error("static price create failed", { error: error.message });
    return { success: false, error: "Failed to create static price", status: 500 };
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "static_price_created",
    entityType: "order",
    entityId: data.id,
    metadata: {
      category: input.category,
      productName: input.productName,
      priceGhs: input.priceGhs,
    },
  });

  return { success: true, data: toResponse(data as DbStaticPriceItem) };
}

/**
 * Update an existing static price entry (admin only).
 */
export async function update(
  client: SupabaseClient,
  admin: AuthenticatedUser,
  id: string,
  input: {
    category?: string;
    productName?: string;
    priceGhs?: number;
    priceMinGhs?: number | null;
    priceMaxGhs?: number | null;
    isActive?: boolean;
    sortOrder?: number;
  },
): Promise<ServiceResult<StaticPriceItemResponse>> {
  const current = await getStaticPriceById(client, id);
  if (!current) {
    return { success: false, error: "Static price not found", status: 404 };
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: admin.id,
  };

  if (input.category !== undefined) updates.category = input.category;
  if (input.productName !== undefined) updates.product_name = input.productName;
  if (input.priceGhs !== undefined) updates.price_ghs = input.priceGhs;
  if (input.priceMinGhs !== undefined) updates.price_min_ghs = input.priceMinGhs;
  if (input.priceMaxGhs !== undefined) updates.price_max_ghs = input.priceMaxGhs;
  if (input.isActive !== undefined) updates.is_active = input.isActive;
  if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder;

  const { data, error } = await client
    .from("static_price_list")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    logger.error("static price update failed", { id, error: error.message });
    return { success: false, error: "Failed to update static price", status: 500 };
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "static_price_updated",
    entityType: "order",
    entityId: id,
    metadata: {
      previous: {
        category: current.category,
        productName: current.product_name,
        priceGhs: current.price_ghs,
        isActive: current.is_active,
      },
      updated: input,
    },
  });

  return { success: true, data: toResponse(data as DbStaticPriceItem) };
}

/**
 * Delete a static price entry (admin only).
 */
export async function remove(
  client: SupabaseClient,
  admin: AuthenticatedUser,
  id: string,
): Promise<ServiceResult<{ deleted: true }>> {
  const current = await getStaticPriceById(client, id);
  if (!current) {
    return { success: false, error: "Static price not found", status: 404 };
  }

  const { error } = await client
    .from("static_price_list")
    .delete()
    .eq("id", id);

  if (error) {
    logger.error("static price delete failed", { id, error: error.message });
    return { success: false, error: "Failed to delete static price", status: 500 };
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "static_price_deleted",
    entityType: "order",
    entityId: id,
    metadata: {
      category: current.category,
      productName: current.product_name,
      priceGhs: current.price_ghs,
    },
  });

  return { success: true, data: { deleted: true } };
}

/**
 * Attempt to match a scraped product to a static price entry.
 * Uses SKU/ASIN exact match, then keyword matching on title, narrowed by category.
 * Returns the matched item or null if no match.
 */
export async function matchProduct(
  product: {
    title: string | null;
    category: string | null;
    sku?: string | null;
    asin?: string | null;
  },
): Promise<ServiceResult<StaticPriceItemResponse | null>> {
  const client = createAdminClient();
  const match = await findMatchingStaticPrice(client, product);

  return {
    success: true,
    data: match ? toResponse(match) : null,
  };
}
