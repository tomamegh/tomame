import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/errors", () => ({
  isSchemaMissingError: (e: unknown) => /does not exist|PGRST205|42P01/i.test(e instanceof Error ? e.message : String(e)),
}));
vi.mock("@/db/queries/carts", () => ({
  findOpenCart: vi.fn(),
  findOpenSessionCart: vi.fn(async () => null),
  insertCart: vi.fn(),
  adoptCart: vi.fn(async () => true),
  setCartStatus: vi.fn(async () => true),
  touchCart: vi.fn(async () => undefined),
  listCartItems: vi.fn(async () => []),
  findCartItem: vi.fn(async () => null),
  getCartItemById: vi.fn(),
  insertCartItem: vi.fn(),
  updateCartItem: vi.fn(),
  deleteCartItem: vi.fn(async () => true),
  moveCartItems: vi.fn(async () => 0),
  countBagItems: vi.fn(async () => 0),
}));
vi.mock("@/features/extraction/extraction.service", () => ({ getExtractionSnapshot: vi.fn() }));
vi.mock("@/features/quotes/services/quote-lock.service", () => ({ applyRateLock: vi.fn() }));
// The real module pulls the exchange-rate service (and a Supabase client) in at import time.
vi.mock("@/features/extraction/quote.service", () => ({
  gapFillOverrides: (result: { product: { price: number | null } }, itemPriceUsd: number | undefined) => {
    if (itemPriceUsd == null || !(itemPriceUsd > 0)) return null;
    if (result.product.price != null && result.product.price > 0) return null;
    return { itemPriceUsd };
  },
}));
vi.mock("@/features/extraction/stores", () => ({ findStore: () => ({ name: "Amazon" }) }));
vi.mock("@/db/queries/pricing-constants", () => ({
  getPricingConstantsMap: vi.fn(async () => ({ box_capacity_lbs: 9, consolidation_saving_pct: 0.2, minimum_chargeable_weight_lbs: 1 })),
}));
vi.mock("@/db/queries/regions", () => ({
  listRegions: vi.fn(async () => [{ code: "USA", name: "United States", departure_weekday: 5, departure_cutoff_hours: 24 }]),
}));
vi.mock("@/db/queries/consolidation-boxes", () => ({
  listBoxesByIds: vi.fn(async () => []),
  insertBox: vi.fn(async (input: Record<string, unknown>) => ({ id: "box-1", status: "open", created_at: "", updated_at: "", ...input })),
  updateOpenBox: vi.fn(async () => true),
}));

import * as carts from "@/db/queries/carts";
import { getExtractionSnapshot } from "@/features/extraction/extraction.service";
import { applyRateLock } from "@/features/quotes/services/quote-lock.service";
import type { ExtractionResult } from "@/features/extraction/types";
import type { PricingBreakdown } from "@/lib/pricing";
import * as boxes from "@/db/queries/consolidation-boxes";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import { addToBag, getBag, removeBagLine, resolveCart, summarize, updateBagLine } from "../services/bag.service";
import type { BagLine } from "../types";

const CACHE_ID = "b4c99974-a1b4-4b49-ac8f-42dd0a0626d8";
const USER = { userId: "u1", sessionId: null };
const ANON = { userId: null, sessionId: "s1" };

const cart = (over: Partial<carts.CartRow> = {}): carts.CartRow => ({
  id: "c1", user_id: "u1", session_id: null, status: "open", delivery_zone_id: null, delivery_address_id: null,
  order_group_id: null, created_at: "", updated_at: "", ...over,
});
const item = (over: Partial<carts.CartItemRow> = {}): carts.CartItemRow => ({
  id: "i1", cart_id: "c1", extraction_cache_id: CACHE_ID, quantity: 1, special_instructions: null, gap_price_usd: null,
  gap_origin_country: null, pricing: null, quote_lock_id: null, consolidation_box_id: null, created_at: "", updated_at: "", ...over,
});
const extraction: ExtractionResult = {
  extraction_attempted: true, extraction_success: true, platform: "amazon", country: "USA",
  product: {
    title: "AirPods Pro", image: "https://x/1.jpg", price: 249, currency: "USD", description: null, brand: "Apple", category: null,
    size: null, weight: "0.6 lb", weight_lbs: 0.6, dimensions: null, specifications: { Color: "White" }, seller: null, condition: null,
    rating: null, review_count: null, images: [], variants: {}, availability: null, metadata: {},
  },
  messages: [], errors: [], source: "scraperapi", sources: ["scraperapi"], confidence: {}, fetched_at: "2026-09-13T00:00:00Z",
};
const breakdown = (over: Partial<PricingBreakdown> = {}): PricingBreakdown => ({
  pricing_method: "weight_expression", pricing_group: "sound_speakers", item_price: 249, item_currency: "USD", item_price_usd: 249,
  quantity: 1, subtotal_usd: 249, exchange_rate: 15.01, mid_market_rate: 14.43, tax_percentage: 0.1, tax_usd: 24.9,
  value_fee_percentage: 0.07, value_fee_usd: 17.43, flat_rate_ghs: 120.08, total_ghs: 4492.5, total_pesewas: 449250, total_usd: 299.3,
  fee_calculation_note: "1 lb × $5/lb + $3 handling", weight_lbs: 1, rate_locked_until: "2026-09-14T00:00:00Z", rate_lock_id: "L1", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getExtractionSnapshot).mockResolvedValue({ id: CACHE_ID, productUrl: "https://www.amazon.com/dp/X", result: extraction });
  vi.mocked(applyRateLock).mockResolvedValue({ pricing: breakdown(), reason: null });
});

describe("addToBag", () => {
  it("creates the cart and the line, prices server-side and remembers the lock", async () => {
    vi.mocked(carts.findOpenCart).mockResolvedValue(null);
    vi.mocked(carts.insertCart).mockResolvedValue(cart());
    vi.mocked(carts.insertCartItem).mockImplementation(async (input) => item({ ...input, id: "i9" }));
    vi.mocked(carts.countBagItems).mockResolvedValue(2);

    const result = await addToBag(USER, { extraction_cache_id: CACHE_ID, quantity: 2 });

    expect(carts.insertCart).toHaveBeenCalledWith(USER);
    expect(applyRateLock).toHaveBeenCalledWith(expect.objectContaining({ viewer: USER, extractionCacheId: CACHE_ID, quantity: 2, overrides: null }));
    expect(carts.insertCartItem).toHaveBeenCalledWith(expect.objectContaining({ cart_id: "c1", quantity: 2, quote_lock_id: "L1" }));
    expect(result.created).toBe(true);
    expect(result.item_count).toBe(2);
    expect(result.line.product).toMatchObject({ title: "AirPods Pro", store: "Amazon", variant: "White", weight_lbs: 1 });
    expect(result.line.pricing?.total_ghs).toBe(4492.5);
  });

  it("adding the same product again raises the quantity instead of a second line", async () => {
    vi.mocked(carts.findOpenCart).mockResolvedValue(cart());
    vi.mocked(carts.findCartItem).mockResolvedValue(item({ quantity: 1 }));
    vi.mocked(carts.updateCartItem).mockImplementation(async (_id, patch) => item({ ...patch } as Partial<carts.CartItemRow>));

    const result = await addToBag(USER, { extraction_cache_id: CACHE_ID, quantity: 1 });

    expect(carts.insertCartItem).not.toHaveBeenCalled();
    expect(carts.updateCartItem).toHaveBeenCalledWith("i1", expect.objectContaining({ quantity: 2 }));
    expect(applyRateLock).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2 }));
    expect(result.created).toBe(false);
  });

  it("passes the gap-fillers only as overrides, never as a price the snapshot already has", async () => {
    vi.mocked(carts.findOpenCart).mockResolvedValue(cart());
    vi.mocked(carts.insertCartItem).mockImplementation(async (input) => item(input));
    const noPrice = { ...extraction, country: null, product: { ...extraction.product, price: null } };
    vi.mocked(getExtractionSnapshot).mockResolvedValue({ id: CACHE_ID, productUrl: "https://shop.example/x", result: noPrice });

    await addToBag(USER, { extraction_cache_id: CACHE_ID, quantity: 1, estimated_price_usd: 80, origin_country: "UK" });
    expect(applyRateLock).toHaveBeenCalledWith(expect.objectContaining({
      overrides: { itemPriceUsd: 80 },
      extraction: expect.objectContaining({ country: "UK" }),
    }));

    vi.mocked(getExtractionSnapshot).mockResolvedValue({ id: CACHE_ID, productUrl: "https://shop.example/x", result: extraction });
    await addToBag(USER, { extraction_cache_id: CACHE_ID, quantity: 1, estimated_price_usd: 1 });
    expect(applyRateLock).toHaveBeenLastCalledWith(expect.objectContaining({ overrides: null }));
  });

  it("404s on an expired quote and 400s on a viewer with no identity", async () => {
    vi.mocked(getExtractionSnapshot).mockResolvedValue(null);
    await expect(addToBag(USER, { extraction_cache_id: CACHE_ID, quantity: 1 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(addToBag({ userId: null, sessionId: null }, { extraction_cache_id: CACHE_ID, quantity: 1 })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("getBag", () => {
  it("re-prices every line on read and rolls up the money", async () => {
    vi.mocked(carts.findOpenCart).mockResolvedValue(cart());
    vi.mocked(carts.listCartItems).mockResolvedValue([item({ id: "a", quantity: 2, pricing: breakdown({ total_ghs: 1 }) }), item({ id: "b", extraction_cache_id: "e2" })]);
    vi.mocked(applyRateLock)
      .mockResolvedValueOnce({ pricing: breakdown({ total_ghs: 100, total_usd: 6, rate_locked_until: "2026-09-15T00:00:00Z" }), reason: null })
      .mockResolvedValueOnce({ pricing: breakdown({ total_ghs: 50, total_usd: 3, rate_locked_until: "2026-09-14T00:00:00Z" }), reason: null });

    const bag = await getBag(USER);
    expect(bag.item_count).toBe(3);
    expect(bag.lines[0]!.pricing?.total_ghs).toBe(100); // the stored snapshot (1) is never returned
    expect(bag.rate_locked_until).toBe("2026-09-14T00:00:00Z");
    expect(bag.has_unpriced_lines).toBe(false);
    // Both lines are 1 lb USA lines: one box, 2 + 1 = 3 lb. The fixture carries no
    // freight_usd, so the saving reads the flat freight: 2 × 120.08 = 240.16 → 20% = 48.03.
    expect(bag.boxes).toHaveLength(1);
    expect(bag.boxes[0]).toMatchObject({ id: "box-1", label: "Box 1", region_name: "United States", weight_lbs: 3, fill_pct: 33, line_ids: ["a", "b"] });
    expect(bag.boxes[0]!.departs_at).toMatch(/T00:00:00.000Z$/);
    expect(new Date(bag.boxes[0]!.departs_at!).getUTCDay()).toBe(5);
    expect(bag.consolidation_saving_ghs).toBe(48.03);
    expect(bag.total_ghs).toBe(101.97);
    expect(boxes.insertBox).toHaveBeenCalledTimes(1);
    expect(carts.updateCartItem).toHaveBeenCalledWith("a", { consolidation_box_id: "box-1" });
    expect(carts.updateCartItem).toHaveBeenCalledWith("b", { consolidation_box_id: "box-1" });
  });

  it("reuses the bag's existing open box and rolls its departure forward once the cutoff has passed", async () => {
    vi.mocked(carts.findOpenCart).mockResolvedValue(cart());
    vi.mocked(carts.listCartItems).mockResolvedValue([item({ id: "a", consolidation_box_id: "box-old" })]);
    vi.mocked(boxes.listBoxesByIds).mockResolvedValue([{ id: "box-old", region_code: "USA", label: "Box 1", capacity_lbs: 9, cutoff_at: "2020-01-01T00:00:00Z", departs_at: "2020-01-02T00:00:00Z", status: "open", created_at: "", updated_at: "" }]);
    const bag = await getBag(USER);
    expect(boxes.insertBox).not.toHaveBeenCalled();
    expect(boxes.updateOpenBox).toHaveBeenCalledWith("box-old", expect.objectContaining({ departs_at: expect.stringMatching(/^2026|^20[3-9]/) }));
    expect(bag.boxes[0]!.id).toBe("box-old");
    expect(carts.updateCartItem).not.toHaveBeenCalledWith("a", expect.objectContaining({ consolidation_box_id: expect.anything() }));
  });

  it("fails loudly when a packing constant is not seeded", async () => {
    vi.mocked(carts.findOpenCart).mockResolvedValue(cart());
    vi.mocked(carts.listCartItems).mockResolvedValue([item()]);
    vi.mocked(getPricingConstantsMap).mockResolvedValueOnce({ box_capacity_lbs: 9 });
    await expect(getBag(USER)).rejects.toThrow(/consolidation_saving_pct/);
  });

  it("a line whose snapshot is gone stays in the bag without a price", async () => {
    vi.mocked(carts.findOpenCart).mockResolvedValue(cart());
    vi.mocked(carts.listCartItems).mockResolvedValue([item()]);
    vi.mocked(getExtractionSnapshot).mockResolvedValue(null);
    const bag = await getBag(USER);
    expect(bag.lines[0]!.pricing).toBeNull();
    expect(bag.lines[0]!.pricing_unavailable_reason).toMatch(/expired/);
    expect(bag.has_unpriced_lines).toBe(true);
    expect(bag.total_ghs).toBe(0);
    expect(bag.boxes).toEqual([]);
    expect(bag.unboxed_line_ids).toEqual(["i1"]);
  });

  it("is empty for a viewer with no cart", async () => {
    vi.mocked(carts.findOpenCart).mockResolvedValue(null);
    expect(await getBag(ANON)).toMatchObject({ cart_id: null, lines: [], item_count: 0 });
  });
});

describe("resolveCart — adoption on sign-in", () => {
  it("adopts the session cart when the user has none", async () => {
    vi.mocked(carts.findOpenCart).mockResolvedValueOnce(null).mockResolvedValueOnce(cart({ session_id: "s1" }));
    vi.mocked(carts.findOpenSessionCart).mockResolvedValue(cart({ id: "anon", user_id: null, session_id: "s1" }));
    const resolved = await resolveCart({ userId: "u1", sessionId: "s1" });
    expect(carts.adoptCart).toHaveBeenCalledWith("anon", "u1");
    expect(resolved?.id).toBe("c1");
  });

  it("merges the session cart into the user's own and retires it", async () => {
    vi.mocked(carts.findOpenCart).mockResolvedValue(cart());
    vi.mocked(carts.findOpenSessionCart).mockResolvedValue(cart({ id: "anon", user_id: null, session_id: "s1" }));
    const resolved = await resolveCart({ userId: "u1", sessionId: "s1" });
    expect(carts.moveCartItems).toHaveBeenCalledWith("anon", "c1");
    expect(carts.setCartStatus).toHaveBeenCalledWith("anon", "open", "merged");
    expect(carts.adoptCart).not.toHaveBeenCalled();
    expect(resolved?.id).toBe("c1");
  });

  it("never touches another session's cart for a signed-in request without a cookie", async () => {
    vi.mocked(carts.findOpenCart).mockResolvedValue(cart());
    await resolveCart(USER);
    expect(carts.findOpenSessionCart).not.toHaveBeenCalled();
  });
});

describe("line ownership", () => {
  it("updating or removing a line from someone else's cart is a 404", async () => {
    vi.mocked(carts.findOpenCart).mockResolvedValue(cart());
    vi.mocked(carts.getCartItemById).mockResolvedValue(item({ cart_id: "other" }));
    await expect(updateBagLine(USER, "i1", { quantity: 3 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(removeBagLine(USER, "i1")).rejects.toMatchObject({ statusCode: 404 });
    expect(carts.deleteCartItem).not.toHaveBeenCalled();
  });

  it("updating quantity re-prices at the new quantity", async () => {
    vi.mocked(carts.findOpenCart).mockResolvedValue(cart());
    vi.mocked(carts.getCartItemById).mockResolvedValue(item());
    vi.mocked(carts.updateCartItem).mockImplementation(async (_id, patch) => item({ ...patch } as Partial<carts.CartItemRow>));
    const line = await updateBagLine(USER, "i1", { quantity: 4 });
    expect(applyRateLock).toHaveBeenCalledWith(expect.objectContaining({ quantity: 4 }));
    expect(line.quantity).toBe(4);
  });
});

describe("summarize", () => {
  it("sums only priced lines and counts every quantity", () => {
    const priced: BagLine = { id: "a", extraction_cache_id: "x", quantity: 2, special_instructions: null, product: { title: null, image: null, url: "", store: null, variant: null, weight_lbs: null, country: null }, pricing: breakdown({ subtotal_usd: 10, tax_usd: 1, value_fee_usd: 0.5, flat_rate_ghs: 20, total_ghs: 200, total_usd: 13 }), pricing_unavailable_reason: null, gap_price_usd: null, gap_origin_country: null };
    const unpriced: BagLine = { ...priced, id: "b", quantity: 1, pricing: null, pricing_unavailable_reason: "x" };
    expect(summarize("c", [priced, unpriced])).toMatchObject({ item_count: 3, subtotal_usd: 10, tax_usd: 1, fee_usd: 0.5, freight_ghs: 20, total_ghs: 200, total_usd: 13, has_unpriced_lines: true });
  });
});
