import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { PricingBreakdown } from "@/lib/pricing";
import type { BoxStatus, ConsolidationBoxRow } from "@/db/queries/consolidation-boxes";

/**
 * Consolidation box reads for the admin console (migration 048).
 *
 * A box is the packing unit: one per region per departure, holding
 * `capacity_lbs` of CHARGEABLE weight. Two different things point at one —
 * `cart_items.consolidation_box_id` for a line still sitting in somebody's open
 * bag, and `orders.consolidation_box_id` for a line that has been paid for — and
 * an admin closing a box needs to see both, because the first is what might
 * still arrive before the cutoff and the second is what is definitely flying.
 *
 * NOTHING HERE PACKS OR PRICES. `src/features/bag/services/box-packing.ts` owns
 * the weight and saving arithmetic; this module reads rows and hands them over.
 * `db/queries/**` is data access only.
 */

export interface AdminBoxItem {
  /** Paid and committed, or still provisional in a customer's bag. */
  kind: "order" | "bag_line";
  id: string;
  /** "TM-00042" for an order; a bag line has no customer-facing number. */
  reference: string | null;
  title: string | null;
  product_url: string | null;
  quantity: number;
  /**
   * The listing's per-unit weight, when the extraction or the breakdown carried
   * one. Null means the packing plan counted this item at 0 lb and said so.
   */
  weight_lbs: number | null;
  /** The stored breakdown — the freight the saving is computed over. */
  pricing: PricingBreakdown | null;
  /** The order's status, for an item that has been paid for. */
  order_status: string | null;
}

export interface AdminBoxRow extends ConsolidationBoxRow {
  items: AdminBoxItem[];
}

export interface AdminBoxFilters {
  /** Defaults to every status — a closed box in the air is still an admin's business. */
  status?: BoxStatus;
  limit?: number;
}

export const ADMIN_BOXES_PAGE_SIZE = 60;

/**
 * Boxes with their contents, soonest departure first.
 *
 * A box with no departure date sorts last rather than first: `departs_at` is
 * null only on a box nobody has scheduled, and an unscheduled box is not the
 * most urgent thing on the screen.
 */
export async function listAdminBoxes(filters: AdminBoxFilters = {}): Promise<AdminBoxRow[]> {
  const db = createAdminClient();

  let query = db
    .from("consolidation_boxes")
    .select(
      "id, region_code, label, capacity_lbs, cutoff_at, departs_at, status, created_at, updated_at",
    )
    .order("departs_at", { ascending: true, nullsFirst: false })
    .limit(filters.limit ?? ADMIN_BOXES_PAGE_SIZE);

  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load boxes: ${error.message}`);

  const boxes = ((data ?? []) as Record<string, unknown>[]).map(normalizeBox);
  if (boxes.length === 0) return [];

  const items = await listBoxContents(boxes.map((box) => box.id));
  return boxes.map((box) => ({ ...box, items: items.get(box.id) ?? [] }));
}

/**
 * What is in each box, from both of the tables that point at one.
 *
 * Orders first, then bag lines, so the committed contents read above the
 * provisional ones without the screen having to sort.
 */
async function listBoxContents(boxIds: string[]): Promise<Map<string, AdminBoxItem[]>> {
  const byBox = new Map<string, AdminBoxItem[]>();
  if (boxIds.length === 0) return byBox;

  const db = createAdminClient();
  const [orders, lines] = await Promise.all([
    db
      .from("orders")
      .select(
        "id, order_no, consolidation_box_id, product_name, product_url, quantity, pricing, extraction_metadata, status",
      )
      .in("consolidation_box_id", boxIds)
      .order("created_at", { ascending: true }),
    db
      .from("cart_items")
      .select("id, consolidation_box_id, extraction_cache_id, quantity, pricing, created_at")
      .in("consolidation_box_id", boxIds)
      .order("created_at", { ascending: true }),
  ]);

  if (orders.error) throw new Error(`Failed to load box contents: ${orders.error.message}`);
  if (lines.error) throw new Error(`Failed to load box contents: ${lines.error.message}`);

  for (const raw of (orders.data ?? []) as Record<string, unknown>[]) {
    push(byBox, String(raw.consolidation_box_id), {
      kind: "order",
      id: String(raw.id),
      reference: (raw.order_no as string | null) ?? null,
      title: (raw.product_name as string | null) ?? null,
      product_url: (raw.product_url as string | null) ?? null,
      quantity: Number(raw.quantity ?? 1),
      weight_lbs: orderWeightLbs(raw),
      pricing: (raw.pricing as PricingBreakdown | null) ?? null,
      order_status: (raw.status as string | null) ?? null,
    });
  }

  const cacheIds = [
    ...new Set(
      ((lines.data ?? []) as Record<string, unknown>[])
        .map((raw) => raw.extraction_cache_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const products = await listCachedProducts(cacheIds);

  for (const raw of (lines.data ?? []) as Record<string, unknown>[]) {
    const cacheId = typeof raw.extraction_cache_id === "string" ? raw.extraction_cache_id : null;
    const product = cacheId ? products.get(cacheId) : undefined;
    const pricing = (raw.pricing as PricingBreakdown | null) ?? null;
    push(byBox, String(raw.consolidation_box_id), {
      kind: "bag_line",
      id: String(raw.id),
      reference: null,
      title: product?.title ?? null,
      product_url: product?.product_url ?? null,
      quantity: Number(raw.quantity ?? 1),
      weight_lbs: pricing?.weight_lbs ?? product?.weight_lbs ?? null,
      pricing,
      order_status: null,
    });
  }

  return byBox;
}

/**
 * The weight an order was packed at.
 *
 * The stored breakdown is preferred because it is what the freight was actually
 * charged on; the extraction snapshot is the fallback for a flat-rate group,
 * whose breakdown carries no weight at all. Neither is recomputed here.
 */
function orderWeightLbs(raw: Record<string, unknown>): number | null {
  const pricing = raw.pricing as PricingBreakdown | null;
  if (pricing?.weight_lbs != null) return Number(pricing.weight_lbs);

  const metadata = raw.extraction_metadata as { product?: { weight_lbs?: number | null } } | null;
  const listed = metadata?.product?.weight_lbs;
  return listed != null && Number.isFinite(Number(listed)) ? Number(listed) : null;
}

interface CachedProduct {
  title: string | null;
  product_url: string | null;
  weight_lbs: number | null;
}

/** Titles and listed weights for the bag lines in these boxes, in one read. */
async function listCachedProducts(ids: string[]): Promise<Map<string, CachedProduct>> {
  const products = new Map<string, CachedProduct>();
  if (ids.length === 0) return products;

  const db = createAdminClient();
  const { data, error } = await db
    .from("extraction_cache")
    .select("id, product_url, result")
    .in("id", ids);

  if (error) {
    // A missing title costs the row a name, not the screen its render.
    logger.warn("admin box product read failed", { message: error.message });
    return products;
  }

  for (const row of (data ?? []) as {
    id: string;
    product_url: string;
    result: { product?: { title?: string | null; weight_lbs?: number | null } } | null;
  }[]) {
    const product = row.result?.product;
    products.set(row.id, {
      title: typeof product?.title === "string" && product.title.trim() ? product.title : null,
      product_url: row.product_url,
      weight_lbs:
        product?.weight_lbs != null && Number.isFinite(Number(product.weight_lbs))
          ? Number(product.weight_lbs)
          : null,
    });
  }
  return products;
}

function push(map: Map<string, AdminBoxItem[]>, key: string, item: AdminBoxItem): void {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

function normalizeBox(row: Record<string, unknown>): ConsolidationBoxRow {
  return {
    id: String(row.id),
    region_code: String(row.region_code),
    label: (row.label as string | null) ?? null,
    capacity_lbs: Number(row.capacity_lbs),
    cutoff_at: (row.cutoff_at as string | null) ?? null,
    departs_at: (row.departs_at as string | null) ?? null,
    status: row.status as BoxStatus,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
