import "server-only";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import { getExtractionRequestById } from "@/db/queries/extraction-requests";
import { getExtractionSnapshot } from "@/features/extraction/extraction.service";
import { gapFillOverrides } from "@/features/extraction/quote.service";
import { applyRateLock } from "@/features/quotes/services/quote-lock.service";
import { pickProductColour } from "@/features/quotes/components/format";
import { findStore } from "@/features/extraction/stores";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import { listRegions, type RegionRow } from "@/db/queries/regions";
import { insertBox, listBoxesByIds, updateOpenBox, type ConsolidationBoxRow } from "@/db/queries/consolidation-boxes";
import { getDeliveryAddressById, listDeliveryAddresses } from "@/db/queries/delivery-addresses";
import { listActiveDeliveryZones, type DeliveryZoneRow } from "@/db/queries/delivery-zones";
import type { DeliveryAddress } from "@/features/addresses/types";
import { nextDeparture, packLines, type BoxConstants, type PackedBox } from "./box-packing";
import type { ExtractionResult } from "@/features/extraction/types";
import type { Viewer } from "@/features/quotes/types";
import { formatAddressLabel } from "@/features/addresses/format";
import type { OriginCountry } from "@/features/orders/types";
import {
  adoptCart,
  countBagItems,
  deleteCartItem,
  findCartItem,
  findCartItemByRequest,
  findOpenCart,
  findOpenSessionCart,
  getCartItemById,
  insertCart,
  insertCartItem,
  listCartItems,
  moveCartItems,
  setCartStatus,
  touchCart,
  updateCart,
  updateCartItem,
  type CartItemRow,
  type CartRow,
} from "@/db/queries/carts";
import type { AddToBagInput, SetBagDeliveryInput, UpdateBagLineInput } from "../schema";
import type { AddToBagResult, BagBox, BagDelivery, BagLine, BagLinePending, BagView } from "../types";

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
 *
 * Delivery rule: the cart remembers ONE choice — a saved address (door) or a
 * pickup zone — and the zone's `fee_ghs` is charged once per checkout, on top
 * of the lines. A signed-in customer with no choice yet gets their default
 * address pre-selected. Ownership is checked on every read, not just on write.
 */

// ── Reads ───────────────────────────────────────────────────────────────────

export async function getBag(viewer: Viewer): Promise<BagView> {
  const cart = await resolveCart(viewer);
  if (!cart) return emptyBag();
  const [rows, delivery] = await Promise.all([listCartItems(cart.id), resolveDelivery(viewer, cart)]);
  const lines = await Promise.all(rows.map((row) => priceLine(viewer, row)));
  const packed = await packIntoBoxes(rows, lines);
  return summarize(cart.id, lines, packed, delivery);
}

/** `sum(quantity)` for the nav badge. Adoption runs here too, so the badge is right straight after sign-in. */
export async function getBagCount(viewer: Viewer): Promise<number> {
  const cart = await resolveCart(viewer);
  return cart ? countBagItems(viewer) : 0;
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function addToBag(viewer: Viewer, input: AddToBagInput): Promise<AddToBagResult> {
  if (!hasIdentity(viewer)) throw new APIError(400, "No bag to add to");
  if (input.extraction_request_id) return addPasteToBag(viewer, input, input.extraction_request_id);

  const snapshot = await getExtractionSnapshot(input.extraction_cache_id!);
  if (!snapshot) throw new APIError(404, "This quote has expired. Paste the link again for a fresh price.");

  const cart = (await resolveCart(viewer)) ?? (await insertCart(viewer));
  const existing = await findCartItem(cart.id, input.extraction_cache_id!);

  const quantity = Math.min(100, (existing?.quantity ?? 0) + input.quantity);
  const gapPrice = input.estimated_price_usd ?? existing?.gap_price_usd ?? null;
  const gapCountry = input.origin_country ?? existing?.gap_origin_country ?? null;
  const note = input.special_instructions?.trim() || existing?.special_instructions || null;

  const priced = await priceSnapshot(viewer, snapshot.result, input.extraction_cache_id!, quantity, gapPrice, gapCountry);

  const row = existing
    ? await updateLineRow(existing.id, { quantity, special_instructions: note, gap_price_usd: gapPrice, gap_origin_country: gapCountry, pricing: priced.pricing, quote_lock_id: priced.pricing?.rate_lock_id ?? existing.quote_lock_id })
    : await insertCartItem({
        cart_id: cart.id,
        extraction_cache_id: input.extraction_cache_id!,
        extraction_request_id: null,
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

/**
 * Add a link the queue is still reading.
 *
 * The whole point of the paste queue: the customer does not wait for a price to
 * claim their place in the bag. The line names the REQUEST, and `priceLine`
 * graduates it to the extraction the moment the job lands.
 *
 * A paste that is ALREADY finished skips all of this and takes the normal path —
 * a product-keyed cache hit is the common case, and it would be perverse to
 * render "still reading" over a price we already hold.
 */
async function addPasteToBag(viewer: Viewer, input: AddToBagInput, requestId: string): Promise<AddToBagResult> {
  const request = await getExtractionRequestById(requestId);
  if (!request) throw new APIError(404, "We have no record of that link.");
  if (!ownsRequest(viewer, request)) throw new APIError(404, "We have no record of that link.");

  if (request.status === "ready" && request.extraction_cache_id) {
    return addToBag(viewer, { ...input, extraction_request_id: undefined, extraction_cache_id: request.extraction_cache_id });
  }

  const cart = (await resolveCart(viewer)) ?? (await insertCart(viewer));
  const existing = await findCartItemByRequest(cart.id, requestId);
  const quantity = Math.min(100, (existing?.quantity ?? 0) + input.quantity);
  const note = input.special_instructions?.trim() || existing?.special_instructions || null;

  const row = existing
    ? await updateLineRow(existing.id, { quantity, special_instructions: note })
    : await insertCartItem({
        cart_id: cart.id,
        extraction_cache_id: null,
        extraction_request_id: requestId,
        quantity,
        special_instructions: note,
        gap_price_usd: input.estimated_price_usd ?? null,
        gap_origin_country: input.origin_country ?? null,
        // Nothing to snapshot yet; the line prices itself on the next bag read.
        pricing: null,
        quote_lock_id: null,
      });
  await touchCart(cart.id);

  const { pending, productUrl } = await pendingStateFor(row);
  return { line: pendingLine(row, pending, productUrl), item_count: await countBagItems(viewer), created: !existing };
}

/**
 * A paste belongs to the viewer asking for it. Checked here because the bag is
 * the trust boundary: a request id is a bare uuid the browser sends, and without
 * this a guessed one would attach somebody else's link to your bag.
 */
function ownsRequest(viewer: Viewer, request: { user_id: string | null; session_id: string | null }): boolean {
  if (request.user_id) return request.user_id === viewer.userId;
  return !!request.session_id && request.session_id === viewer.sessionId;
}

export async function updateBagLine(viewer: Viewer, lineId: string, input: UpdateBagLineInput): Promise<BagLine> {
  const { row } = await ownedLine(viewer, lineId);

  // A line still being read has nothing to price, but the quantity and the note
  // are the customer's either way — refusing them would make the line feel
  // broken rather than merely unfinished. It prices at the quantity it ends on.
  if (!row.extraction_cache_id) {
    const updated = await updateLineRow(row.id, {
      quantity: input.quantity ?? row.quantity,
      special_instructions: input.special_instructions === undefined ? row.special_instructions : input.special_instructions,
    });
    await touchCart(row.cart_id);
    const { pending, productUrl } = await pendingStateFor(updated);
    return pendingLine(updated, pending, productUrl);
  }

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

/**
 * Choose where the bag goes. An address needs a signed-in owner; a zone must be
 * an active pickup point. Exactly one column is set, the other nulled; `null`
 * clears both. Returns the re-priced bag with the fee applied.
 */
export async function setBagDelivery(viewer: Viewer, input: SetBagDeliveryInput): Promise<BagView> {
  if (!hasIdentity(viewer)) throw new APIError(400, "No bag to deliver");
  const cart = (await resolveCart(viewer)) ?? (await insertCart(viewer));

  if (input.delivery_address_id === null || input.delivery_zone_id === null) {
    await updateCart(cart.id, { delivery_address_id: null, delivery_zone_id: null });
  } else if (input.delivery_address_id !== undefined) {
    if (!viewer.userId) throw new APIError(401, "Sign in to choose an address");
    const address = await getDeliveryAddressById(input.delivery_address_id);
    if (!address || address.user_id !== viewer.userId) throw new APIError(404, "Address not found");
    if (!address.delivery_zone_id) throw new APIError(400, "This address has no delivery zone yet");
    // Validated here, not only on read: otherwise a retired zone makes the PATCH
    // "succeed" and the very next getBag silently forgets the choice.
    const zone = (await listActiveDeliveryZones()).find((z) => z.id === address.delivery_zone_id);
    if (!zone || zone.kind !== "door") throw new APIError(400, "We no longer deliver to this address's zone");
    await updateCart(cart.id, { delivery_address_id: address.id, delivery_zone_id: null });
  } else if (input.delivery_zone_id !== undefined) {
    const zone = (await listActiveDeliveryZones()).find((z) => z.id === input.delivery_zone_id);
    if (!zone || zone.kind !== "pickup") throw new APIError(400, "Choose a pickup point");
    await updateCart(cart.id, { delivery_zone_id: zone.id, delivery_address_id: null });
  }
  return getBag(viewer);
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

// ── Delivery ────────────────────────────────────────────────────────────────

/**
 * The cart's delivery choice, re-validated: an address that was deleted, lost
 * its zone or belongs to someone else is forgotten; a zone that is no longer an
 * active pickup point likewise. With nothing left, a signed-in customer's
 * default address is chosen and remembered so the bag lands with it selected.
 */
async function resolveDelivery(viewer: Viewer, cart: CartRow): Promise<BagDelivery | null> {
  const zones = await listActiveDeliveryZones();
  const zoneById = (id: string | null) => (id ? zones.find((z) => z.id === id) ?? null : null);

  if (cart.delivery_address_id) {
    const address = await getDeliveryAddressById(cart.delivery_address_id);
    const zone = address && address.user_id === viewer.userId ? zoneById(address.delivery_zone_id) : null;
    if (address && zone) return doorDelivery(address, zone);
    await updateCart(cart.id, { delivery_address_id: null });
  } else if (cart.delivery_zone_id) {
    const zone = zoneById(cart.delivery_zone_id);
    if (zone?.kind === "pickup") return pickupDelivery(zone);
    await updateCart(cart.id, { delivery_zone_id: null });
  }

  if (!viewer.userId) return null;
  const fallback = (await listDeliveryAddresses(viewer.userId)).find((a) => a.is_default && a.delivery_zone_id);
  const zone = fallback ? zoneById(fallback.delivery_zone_id) : null;
  if (!fallback || !zone) return null;
  await updateCart(cart.id, { delivery_address_id: fallback.id, delivery_zone_id: null });
  return doorDelivery(fallback, zone);
}

function doorDelivery(address: DeliveryAddress, zone: DeliveryZoneRow): BagDelivery {
  return {
    kind: "door",
    address_id: address.id,
    zone_id: zone.id,
    zone_name: zone.name,
    label: formatAddressLabel(address),
    fee_ghs: zone.fee_ghs,
  };
}

function pickupDelivery(zone: DeliveryZoneRow): BagDelivery {
  return { kind: "pickup", address_id: null, zone_id: zone.id, zone_name: zone.name, label: zone.name, fee_ghs: zone.fee_ghs };
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
  // A line added before its price existed (049). Try to graduate it first: the
  // job may well have landed since the last read.
  const settled = row.extraction_cache_id ? row : await graduatePendingLine(row);
  if (!settled.extraction_cache_id) {
    const { pending, productUrl } = await pendingStateFor(settled);
    return pendingLine(settled, pending, productUrl);
  }

  const snapshot = await getExtractionSnapshot(settled.extraction_cache_id);
  if (!snapshot) {
    return toLine(settled, null, { pricing: null, reason: "This quote has expired. Remove the line and paste the link again." });
  }
  const priced = await priceSnapshot(viewer, snapshot.result, settled.extraction_cache_id, settled.quantity, settled.gap_price_usd, settled.gap_origin_country);
  return toLine(settled, snapshot, priced);
}

/**
 * Point a pending line at its extraction once the job has finished.
 *
 * A write inside a read, like the box materialisation below it, and idempotent
 * for the same reason: the line is only moved when the paste actually carries a
 * cache id, and moving it twice is the same as moving it once. Doing it here
 * rather than from the job means a line graduates on the next thing that looks
 * at the bag — no coupling from the extraction queue back into carts.
 */
async function graduatePendingLine(row: CartItemRow): Promise<CartItemRow> {
  if (!row.extraction_request_id) return row;
  const request = await getExtractionRequestById(row.extraction_request_id);
  if (request?.status !== "ready" || !request.extraction_cache_id) return row;

  const updated = await updateCartItem(row.id, { extraction_cache_id: request.extraction_cache_id });
  return updated ?? row;
}

/**
 * How far the paste behind a still-unpriced line has got, and the link it came
 * from — the one thing the customer can recognise while the rest is unknown.
 */
async function pendingStateFor(row: CartItemRow): Promise<{ pending: BagLinePending; productUrl: string }> {
  const lost: BagLinePending = {
    request_id: row.extraction_request_id ?? "",
    status: "failed",
    error: "We lost track of this link. Remove it and paste it again.",
    queued_at: row.created_at,
  };
  if (!row.extraction_request_id) return { pending: lost, productUrl: "" };

  const request = await getExtractionRequestById(row.extraction_request_id);
  if (!request) return { pending: lost, productUrl: "" };

  return {
    pending: {
      request_id: request.id,
      // `ready` cannot reach here — graduation would have taken it — so anything
      // that is not pending or running is a dead end for this line.
      status: request.status === "pending" || request.status === "running" ? request.status : "failed",
      error: request.status === "failed" ? request.error : null,
      queued_at: request.created_at,
    },
    productUrl: request.product_url,
  };
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
    boxes.push(toBagBox(row, packed, region, lines));
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

function toBagBox(row: ConsolidationBoxRow, packed: PackedBox, region: RegionRow | null, lines: BagLine[]): BagBox {
  const inBox = new Set(packed.line_ids);
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
    marginal_saving_ghs: packed.marginal_saving_ghs,
    item_count: lines.reduce((acc, l) => (inBox.has(l.id) ? acc + l.quantity : acc), 0),
    unweighed_line_count: packed.unweighed_line_count,
    has_unweighed_lines: packed.has_unweighed_lines,
  };
}

// ── Shaping ─────────────────────────────────────────────────────────────────

/**
 * A line that has nothing but a link yet.
 *
 * Everything the bag normally reads off the extraction is genuinely unknown, so
 * it is null rather than guessed — the screen shows the URL and says it is still
 * reading. `pricing` is null for the same reason the pricing failure case is:
 * there is no price, and the summary leaves it out of the total.
 */
function pendingLine(row: CartItemRow, pending: BagLinePending, productUrl: string): BagLine {
  return {
    id: row.id,
    extraction_cache_id: null,
    pending,
    quantity: row.quantity,
    special_instructions: row.special_instructions,
    product: {
      title: null,
      image: null,
      url: productUrl,
      store: null,
      variant: null,
      weight_lbs: null,
      country: row.gap_origin_country,
    },
    pricing: null,
    pricing_unavailable_reason: null,
    gap_price_usd: row.gap_price_usd,
    gap_origin_country: row.gap_origin_country,
  };
}


type Snapshot = { id: string; productUrl: string; result: ExtractionResult } | null;

function toLine(row: CartItemRow, snapshot: Snapshot, priced: Priced): BagLine {
  const product = snapshot?.result.product ?? null;
  const colour = product ? pickProductColour(product) : null;
  const variantParts = [colour?.selected ?? null, product?.size ?? null].filter((v): v is string => !!v);
  return {
    id: row.id,
    extraction_cache_id: row.extraction_cache_id,
    pending: null,
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

export function summarize(cartId: string | null, lines: BagLine[], packed: Packed = NO_BOXES, delivery: BagDelivery | null = null): BagView {
  const priced = lines.map((l) => l.pricing).filter((p): p is NonNullable<BagLine["pricing"]> => p != null);
  const sum = (pick: (p: NonNullable<BagLine["pricing"]>) => number) => r2(priced.reduce((acc, p) => acc + pick(p), 0));
  const locks = priced.map((p) => p.rate_locked_until).filter((v): v is string => !!v).sort();
  const grossGhs = sum((p) => p.total_ghs);
  // The delivery fee is charged only when there is something to deliver.
  const deliveryFeeGhs = delivery && priced.length > 0 ? r2(delivery.fee_ghs) : 0;
  const totalGhs = r2(grossGhs - packed.consolidation_saving_ghs + deliveryFeeGhs);
  // The USD echo follows the same ratio the lines were struck at; no rate is applied here.
  const totalUsd = grossGhs > 0 ? r2((sum((p) => p.total_usd ?? 0) * totalGhs) / grossGhs) : 0;
  return {
    delivery,
    delivery_fee_ghs: deliveryFeeGhs,
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
    has_pending_lines: lines.some((l) => l.pending != null),
  };
}

function emptyBag(): BagView {
  return summarize(null, []);
}

