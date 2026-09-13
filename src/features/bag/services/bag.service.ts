import "server-only";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import { getExtractionSnapshot } from "@/features/extraction/extraction.service";
import { gapFillOverrides } from "@/features/extraction/quote.service";
import { applyRateLock } from "@/features/quotes/services/quote-lock.service";
import { pickProductColour } from "@/features/quotes/components/format";
import { findStore } from "@/features/extraction/stores";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import { listRegions, type RegionRow } from "@/db/queries/regions";
import { insertBox, listBoxesByIds, updateOpenBox, type ConsolidationBoxRow } from "@/db/queries/consolidation-boxes";
import { nextDeparture, packLines, type BoxConstants, type PackedBox } from "./box-packing";
import type { ExtractionResult } from "@/features/extraction/types";
import type { Viewer } from "@/features/quotes/types";
import type { OriginCountry } from "@/features/orders/types";
import {
  adoptCart,
  countBagItems,
  deleteCartItem,
  findCartItem,
  findOpenCart,
  findOpenSessionCart,
  getCartItemById,
  insertCart,
  insertCartItem,
  listCartItems,
  moveCartItems,
  setCartStatus,
  touchCart,
  updateCartItem,
  type CartItemRow,
  type CartRow,
} from "@/db/queries/carts";
import type { AddToBagInput, UpdateBagLineInput } from "../schema";
import type { AddToBagResult, BagBox, BagLine, BagView } from "../types";

/**
 * The bag: the viewer's open cart, re-priced from the server-owned extraction
 * snapshot on every read.
 *
 * Money rule: `cart_items.pricing` is what the customer saw when they added the
 * line and is never returned as the price. Each read prices every line again
 * under the viewer's rate lock (lower of locked and live, `applyRateLock`), so
 * the bag, the quote screen and checkout can only ever disagree in the
 * customer's favour.
 *
 * Identity rule: same as the quote lock. A signed-out visitor owns the bag via
 * the `tm_quote_session` cookie; on the first signed-in request the session's
 * bag is adopted onto the user, or merged into the user's own open bag when
 * both exist. The browser never names a cart or a line it does not own — every
 * line is looked up through the viewer's cart.
 */

// ── Reads ───────────────────────────────────────────────────────────────────

export async function getBag(viewer: Viewer): Promise<BagView> {
  const cart = await resolveCart(viewer);
  if (!cart) return emptyBag();
  const rows = await listCartItems(cart.id);
  const lines = await Promise.all(rows.map((row) => priceLine(viewer, row)));
  const packed = await packIntoBoxes(rows, lines);
  return summarize(cart.id, lines, packed);
}

/** `sum(quantity)` for the nav badge. Adoption runs here too, so the badge is right straight after sign-in. */
export async function getBagCount(viewer: Viewer): Promise<number> {
  const cart = await resolveCart(viewer);
  return cart ? countBagItems(viewer) : 0;
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function addToBag(viewer: Viewer, input: AddToBagInput): Promise<AddToBagResult> {
  if (!hasIdentity(viewer)) throw new APIError(400, "No bag to add to");
  const snapshot = await getExtractionSnapshot(input.extraction_cache_id);
  if (!snapshot) throw new APIError(404, "This quote has expired. Paste the link again for a fresh price.");

  const cart = (await resolveCart(viewer)) ?? (await insertCart(viewer));
  const existing = await findCartItem(cart.id, input.extraction_cache_id);

  const quantity = Math.min(100, (existing?.quantity ?? 0) + input.quantity);
  const gapPrice = input.estimated_price_usd ?? existing?.gap_price_usd ?? null;
  const gapCountry = input.origin_country ?? existing?.gap_origin_country ?? null;
  const note = input.special_instructions?.trim() || existing?.special_instructions || null;

  const priced = await priceSnapshot(viewer, snapshot.result, input.extraction_cache_id, quantity, gapPrice, gapCountry);

  const row = existing
    ? await updateLineRow(existing.id, { quantity, special_instructions: note, gap_price_usd: gapPrice, gap_origin_country: gapCountry, pricing: priced.pricing, quote_lock_id: priced.pricing?.rate_lock_id ?? existing.quote_lock_id })
    : await insertCartItem({
        cart_id: cart.id,
        extraction_cache_id: input.extraction_cache_id,
        quantity,
        special_instructions: note,
        gap_price_usd: gapPrice,
        gap_origin_country: gapCountry,
        pricing: priced.pricing,
        quote_lock_id: priced.pricing?.rate_lock_id ?? null,
      });
  await touchCart(cart.id);

  const line = toLine(row, snapshot, priced);
  return { line, item_count: await countBagItems(viewer), created: !existing };
}

export async function updateBagLine(viewer: Viewer, lineId: string, input: UpdateBagLineInput): Promise<BagLine> {
  const { row } = await ownedLine(viewer, lineId);
  const snapshot = await getExtractionSnapshot(row.extraction_cache_id);
  if (!snapshot) throw new APIError(410, "This quote has expired. Remove the line and paste the link again.");

  const quantity = input.quantity ?? row.quantity;
  const note = input.special_instructions === undefined ? row.special_instructions : input.special_instructions;
  const priced = await priceSnapshot(viewer, snapshot.result, row.extraction_cache_id, quantity, row.gap_price_usd, row.gap_origin_country);
  const updated = await updateLineRow(row.id, { quantity, special_instructions: note, pricing: priced.pricing, quote_lock_id: priced.pricing?.rate_lock_id ?? row.quote_lock_id });
  await touchCart(row.cart_id);
  return toLine(updated, snapshot, priced);
}

export async function removeBagLine(viewer: Viewer, lineId: string): Promise<{ item_count: number }> {
  const { row } = await ownedLine(viewer, lineId);
  await deleteCartItem(row.id);
  await touchCart(row.cart_id);
  return { item_count: await countBagItems(viewer) };
}

// ── Identity ────────────────────────────────────────────────────────────────

/**
 * The viewer's open cart, adopting or merging an anonymous session cart on the
 * first signed-in request. Adoption failures other than a missing table are
 * logged and the user's own cart (or none) is returned — a customer can always
 * see their bag.
 */
export async function resolveCart(viewer: Viewer): Promise<CartRow | null> {
  if (!hasIdentity(viewer)) return null;
  const own = await findOpenCart(viewer);
  if (!viewer.userId || !viewer.sessionId) return own;

  try {
    const stray = await findOpenSessionCart(viewer.sessionId);
    if (!stray) return own;
    if (!own) {
      return (await adoptCart(stray.id, viewer.userId)) ? await findOpenCart(viewer) : own;
    }
    await moveCartItems(stray.id, own.id);
    await setCartStatus(stray.id, "open", "merged");
    return own;
  } catch (error) {
    if (isSchemaMissingError(error)) throw error;
    logger.error("bag: adopting the session cart failed", { error: error instanceof Error ? error.message : String(error) });
    return own;
  }
}

function hasIdentity(viewer: Viewer): boolean {
  return viewer.userId != null || viewer.sessionId != null;
}

async function ownedLine(viewer: Viewer, lineId: string): Promise<{ cart: CartRow; row: CartItemRow }> {
  const cart = await resolveCart(viewer);
  const row = cart ? await getCartItemById(lineId) : null;
  if (!cart || !row || row.cart_id !== cart.id) throw new APIError(404, "That line is not in your bag");
  return { cart, row };
}

// ── Pricing ─────────────────────────────────────────────────────────────────

interface Priced {
  pricing: BagLine["pricing"];
  reason: string | null;
}

/**
 * Price one line the way the quote screen does: the live snapshot, the
 * customer's gap-fillers only where the extraction left a gap, the viewer's
 * rate lock for FX. A pricing failure is a line without a price, never a bag
 * that will not load.
 */
async function priceSnapshot(
  viewer: Viewer,
  result: ExtractionResult,
  extractionCacheId: string,
  quantity: number,
  gapPriceUsd: number | null,
  gapCountry: OriginCountry | null,
): Promise<Priced> {
  const extraction: ExtractionResult = { ...result, country: result.country ?? gapCountry };
  try {
    return await applyRateLock({
      viewer,
      extraction,
      extractionCacheId,
      quantity,
      overrides: gapFillOverrides(extraction, gapPriceUsd ?? undefined),
    });
  } catch (error) {
    if (isSchemaMissingError(error)) throw error;
    logger.error("bag: pricing a line failed", { extractionCacheId, error: error instanceof Error ? error.message : String(error) });
    return { pricing: null, reason: "We could not price this line right now." };
  }
}

async function priceLine(viewer: Viewer, row: CartItemRow): Promise<BagLine> {
  const snapshot = await getExtractionSnapshot(row.extraction_cache_id);
  if (!snapshot) {
    return toLine(row, null, { pricing: null, reason: "This quote has expired. Remove the line and paste the link again." });
  }
  const priced = await priceSnapshot(viewer, snapshot.result, row.extraction_cache_id, row.quantity, row.gap_price_usd, row.gap_origin_country);
  return toLine(row, snapshot, priced);
}

async function updateLineRow(id: string, patch: Parameters<typeof updateCartItem>[1]): Promise<CartItemRow> {
  const row = await updateCartItem(id, patch);
  if (!row) throw new APIError(404, "That line is no longer in your bag");
  return row;
}

// ── Boxes ───────────────────────────────────────────────────────────────────

export class BagConstantsMissingError extends Error {
  constructor(keys: string[]) {
    super(`pricing_constants is missing ${keys.join(", ")} — seed them (migrations 035/037) before the bag can pack boxes`);
    this.name = "BagConstantsMissingError";
  }
}

/** The three admin knobs the packer reads. A missing seed is a deploy bug and surfaces. */
export async function loadBoxConstants(): Promise<BoxConstants> {
  const map = await getPricingConstantsMap();
  const keys = ["box_capacity_lbs", "consolidation_saving_pct", "minimum_chargeable_weight_lbs"] as const;
  const missing = keys.filter((k) => typeof map[k] !== "number" || !Number.isFinite(map[k]));
  if (missing.length) throw new BagConstantsMissingError([...missing]);
  return {
    box_capacity_lbs: map.box_capacity_lbs!,
    consolidation_saving_pct: map.consolidation_saving_pct!,
    minimum_chargeable_weight_lbs: map.minimum_chargeable_weight_lbs!,
  };
}

interface Packed {
  boxes: BagBox[];
  unboxed_line_ids: string[];
  consolidation_saving_ghs: number;
  consolidation_saving_pct: number;
}

/**
 * Pack the priced lines into this bag's boxes and persist the assignment.
 *
 * Boxes are per bag: a `consolidation_boxes` row is opened for each (region,
 * index) the plan needs, reused across reads through `cart_items.
 * consolidation_box_id`, and retargeted to the region's next departure when
 * its cutoff has passed. Nothing here is money the customer is charged yet —
 * the saving is recomputed at checkout from the same function.
 */
async function packIntoBoxes(rows: CartItemRow[], lines: BagLine[]): Promise<Packed> {
  const [constants, regions] = await Promise.all([loadBoxConstants(), listRegions()]);
  const regionByCode = new Map(regions.map((r) => [r.code, r]));
  const plan = packLines(
    lines.map((l) => ({ id: l.id, quantity: l.quantity, region_code: l.product.country, weight_lbs: l.product.weight_lbs, pricing: l.pricing })),
    constants,
  );

  const existingIds = [...new Set(rows.map((r) => r.consolidation_box_id).filter((v): v is string => !!v))];
  const existing = await listBoxesByIds(existingIds);
  const openByRegion = new Map<string, ConsolidationBoxRow[]>();
  for (const box of existing) {
    if (box.status !== "open") continue;
    const list = openByRegion.get(box.region_code) ?? [];
    list.push(box);
    openByRegion.set(box.region_code, list);
  }

  const now = new Date();
  const boxes: BagBox[] = [];
  for (const packed of plan.boxes) {
    const region = regionByCode.get(packed.region_code) ?? null;
    const row = await materializeBox(packed, region, openByRegion, constants, now);
    boxes.push(toBagBox(row, packed, region));
    for (const lineId of packed.line_ids) {
      const item = rows.find((r) => r.id === lineId);
      if (item && item.consolidation_box_id !== row.id) await updateCartItem(item.id, { consolidation_box_id: row.id });
    }
  }
  for (const lineId of plan.unboxed_line_ids) {
    const item = rows.find((r) => r.id === lineId);
    if (item?.consolidation_box_id) await updateCartItem(item.id, { consolidation_box_id: null });
  }

  return { boxes, unboxed_line_ids: plan.unboxed_line_ids, consolidation_saving_ghs: plan.consolidation_saving_ghs, consolidation_saving_pct: constants.consolidation_saving_pct };
}

/** Reuse the bag's n-th open box in the region, or open one; keep its schedule current. */
async function materializeBox(
  packed: PackedBox,
  region: RegionRow | null,
  openByRegion: Map<string, ConsolidationBoxRow[]>,
  constants: BoxConstants,
  now: Date,
): Promise<ConsolidationBoxRow> {
  const schedule = region?.departure_weekday != null ? nextDeparture(now, region.departure_weekday, region.departure_cutoff_hours) : null;
  const label = `Box ${packed.index}`;
  const pool = openByRegion.get(packed.region_code) ?? [];
  const reused = pool[packed.index - 1];
  if (reused) {
    const patch: Parameters<typeof updateOpenBox>[1] = {};
    if (reused.label !== label) patch.label = label;
    if (reused.capacity_lbs !== constants.box_capacity_lbs) patch.capacity_lbs = constants.box_capacity_lbs;
    // Roll forward once the cutoff has passed; never move a box's departure earlier.
    if (schedule && (!reused.cutoff_at || new Date(reused.cutoff_at).getTime() <= now.getTime())) {
      patch.departs_at = schedule.departs_at.toISOString();
      patch.cutoff_at = schedule.cutoff_at.toISOString();
    }
    if (Object.keys(patch).length) await updateOpenBox(reused.id, patch);
    return { ...reused, ...patch };
  }
  const created = await insertBox({
    region_code: packed.region_code,
    label,
    capacity_lbs: constants.box_capacity_lbs,
    departs_at: schedule ? schedule.departs_at.toISOString() : null,
    cutoff_at: schedule ? schedule.cutoff_at.toISOString() : null,
  });
  pool.push(created);
  openByRegion.set(packed.region_code, pool);
  return created;
}

function toBagBox(row: ConsolidationBoxRow, packed: PackedBox, region: RegionRow | null): BagBox {
  return {
    id: row.id,
    label: row.label ?? `Box ${packed.index}`,
    region_code: packed.region_code,
    region_name: region?.name ?? packed.region_code,
    departs_at: row.departs_at,
    cutoff_at: row.cutoff_at,
    capacity_lbs: packed.capacity_lbs,
    weight_lbs: packed.weight_lbs,
    fill_pct: packed.fill_pct,
    headroom_lbs: packed.headroom_lbs,
    line_ids: packed.line_ids,
    freight_ghs: packed.freight_ghs,
    saving_ghs: packed.saving_ghs,
    has_unweighed_lines: packed.has_unweighed_lines,
  };
}

// ── Shaping ─────────────────────────────────────────────────────────────────

type Snapshot = { id: string; productUrl: string; result: ExtractionResult } | null;

function toLine(row: CartItemRow, snapshot: Snapshot, priced: Priced): BagLine {
  const product = snapshot?.result.product ?? null;
  const colour = product ? pickProductColour(product) : null;
  const variantParts = [colour?.selected ?? null, product?.size ?? null].filter((v): v is string => !!v);
  return {
    id: row.id,
    extraction_cache_id: row.extraction_cache_id,
    quantity: row.quantity,
    special_instructions: row.special_instructions,
    product: {
      title: product?.title ?? null,
      image: product?.image ?? null,
      url: snapshot?.productUrl ?? "",
      store: snapshot ? (findStore(snapshot.productUrl)?.name ?? snapshot.result.platform) : null,
      variant: variantParts.length ? variantParts.join(" · ") : null,
      weight_lbs: priced.pricing?.weight_lbs ?? product?.weight_lbs ?? null,
      country: snapshot?.result.country ?? row.gap_origin_country,
    },
    pricing: priced.pricing,
    pricing_unavailable_reason: priced.pricing ? null : priced.reason,
    gap_price_usd: row.gap_price_usd,
    gap_origin_country: row.gap_origin_country,
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const NO_BOXES: Packed = { boxes: [], unboxed_line_ids: [], consolidation_saving_ghs: 0, consolidation_saving_pct: 0 };

export function summarize(cartId: string | null, lines: BagLine[], packed: Packed = NO_BOXES): BagView {
  const priced = lines.map((l) => l.pricing).filter((p): p is NonNullable<BagLine["pricing"]> => p != null);
  const sum = (pick: (p: NonNullable<BagLine["pricing"]>) => number) => r2(priced.reduce((acc, p) => acc + pick(p), 0));
  const locks = priced.map((p) => p.rate_locked_until).filter((v): v is string => !!v).sort();
  const grossGhs = sum((p) => p.total_ghs);
  const totalGhs = r2(grossGhs - packed.consolidation_saving_ghs);
  // The USD echo follows the same ratio the lines were struck at; no rate is applied here.
  const totalUsd = grossGhs > 0 ? r2((sum((p) => p.total_usd ?? 0) * totalGhs) / grossGhs) : 0;
  return {
    cart_id: cartId,
    lines,
    boxes: packed.boxes,
    unboxed_line_ids: packed.unboxed_line_ids,
    consolidation_saving_ghs: packed.consolidation_saving_ghs,
    consolidation_saving_pct: packed.consolidation_saving_pct,
    item_count: lines.reduce((acc, l) => acc + l.quantity, 0),
    subtotal_usd: sum((p) => p.subtotal_usd),
    tax_usd: sum((p) => p.tax_usd),
    fee_usd: sum((p) => p.value_fee_usd),
    freight_ghs: sum((p) => p.flat_rate_ghs),
    boxed_weight_lbs: r2(packed.boxes.reduce((acc, b) => acc + b.weight_lbs, 0)),
    total_ghs: totalGhs,
    total_usd: totalUsd,
    rate_locked_until: locks[0] ?? null,
    has_unpriced_lines: priced.length < lines.length,
  };
}

function emptyBag(): BagView {
  return summarize(null, []);
}

