import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

// `buildDeals` / `buildAskBuyer` are pure, but they live beside `getHomeView`,
// whose imports reach the admin Supabase client at module scope. Stubbed so
// this file stays a plain unit test with no environment.
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/features/auth/services/auth.service", () => ({
  getAuthenticatedUser: vi.fn(),
}));
vi.mock("@/db/queries/orders", () => ({
  countMovingOrders: vi.fn(),
  getRecentOrdersForUser: vi.fn(),
}));
vi.mock("@/db/queries/receipt-state", () => ({
  getReceiptFulfilment: vi.fn(async () => ({ kind: "none" })),
  NO_FULFILMENT: { kind: "none" },
}));
vi.mock("@/db/queries/assisted-requests", () => ({
  listOpenAssistedRequestsByUrl: vi.fn(async () => new Map()),
}));
vi.mock("@/db/queries/extraction-requests", () => ({
  getLatestExtractionRequest: vi.fn(),
}));
vi.mock("@/db/queries/extraction-cache", () => ({
  getExtractionById: vi.fn(),
  getCachedExtractionByHash: vi.fn(),
}));
// The freight-box card reads the open bag; the bag service reaches Supabase at
// module scope, so it is stubbed like every other data dependency here.
vi.mock("@/features/bag/services/bag.service", () => ({ getBag: vi.fn(async () => null) }));
vi.mock("@/db/queries/site-settings", () => ({ getSiteSettingsMap: vi.fn() }));
vi.mock("@/features/watches/services/watches.service", () => ({
  listWatches: vi.fn(async () => ({ watches: [], watching_count: 0 })),
}));
vi.mock("@/features/quotes/services/quote-constants.service", () => {
  class QuoteConstantsMissingError extends Error {}
  return {
    QuoteConstantsMissingError,
    loadQuoteConstants: vi.fn(async () => ({ rate_lock_hours: 24, purchase_lead_days_min: 1, purchase_lead_days_max: 3 })),
  };
});
vi.mock("@/features/quotes/services/quote-lock.service", () => ({
  priceUnderExistingLock: vi.fn(),
}));
// The deals shelf's two reads. Both reach `catalog_products` through the admin
// client at module scope, which is exactly what this file must not need.
vi.mock("@/features/catalog/services/catalog-search.service", () => ({
  listCatalogDeals: vi.fn(),
  listBrowsableCategories: vi.fn(),
}));

import type { BagView } from "@/features/bag/types";
import type { CatalogProduct } from "@/features/catalog/types";
import {
  buildAskBuyer,
  buildDeals,
  buildFreightBox,
  countCatalogue,
} from "../services/home.service";

/**
 * The pure halves of the Home view model. Everything here takes rows and
 * returns what a card prints, so these are the tests that stop the shelf from
 * inventing a product, a count or a shelf that opens onto nothing.
 */

function product(id: string, overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id,
    store: "amazon",
    external_id: null,
    title: `Product ${id}`,
    image_url: null,
    product_url: `https://amazon.com/dp/${id}`,
    price_usd: 20,
    currency: "USD",
    rating: 4.5,
    review_count: 100,
    category: "Electronics",
    last_seen_at: "2026-09-14T00:00:00.000Z",
    total_ghs: 400,
    pricing_group: "electronics",
    pricing_method: "weight",
    exchange_rate: 12,
    unpriceable: false,
    cheapest_in_store: false,
    ...overrides,
  };
}

describe("buildDeals", () => {
  it("hands the shelf its products, its pills and the browse address", () => {
    const deals = buildDeals([product("a"), product("b")], [
      { category: "Electronics", count: 40 },
      { category: "Home", count: 9 },
    ]);

    expect(deals?.products).toHaveLength(2);
    expect(deals?.browseHref).toBe("/app/orders/new?mode=browse");
    expect(deals?.categories).toEqual([
      {
        label: "Electronics",
        count: 40,
        href: "/app/orders/new?mode=browse&category=Electronics",
      },
      { label: "Home", count: 9, href: "/app/orders/new?mode=browse&category=Home" },
    ]);
  });

  it("shows no shelf at all when nothing could be priced", () => {
    expect(buildDeals([], [{ category: "Electronics", count: 40 }])).toBeNull();
  });

  it("caps the pills, so a catalogue with forty shelves does not paper the screen", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      category: `Shelf ${i}`,
      count: 20 - i,
    }));
    expect(buildDeals([product("a")], many)?.categories).toHaveLength(6);
  });

  it("escapes a category with a space in it rather than breaking the address", () => {
    const deals = buildDeals([product("a")], [{ category: "Home & Kitchen", count: 4 }]);
    expect(deals?.categories[0]?.href).toBe(
      "/app/orders/new?mode=browse&category=Home+%26+Kitchen",
    );
  });
});

describe("countCatalogue", () => {
  it("sums every shelf", () => {
    expect(
      countCatalogue([
        { category: "Electronics", count: 40 },
        { category: "Home", count: 9 },
      ]),
    ).toBe(49);
  });

  it("is zero for an empty catalogue, which is what turns the search branch off", () => {
    expect(countCatalogue([])).toBe(0);
  });
});

describe("buildAskBuyer", () => {
  it("turns a stored number into a wa.me link and carries the support hours", () => {
    expect(
      buildAskBuyer({
        whatsapp_number: "+233 24 555 0192",
        support_hours: "8am–10pm",
      }),
    ).toEqual({
      whatsappHref: "https://wa.me/233245550192",
      supportHours: "8am–10pm",
    });
  });

  it("reports no href at all when the number is missing or unusable", () => {
    expect(buildAskBuyer({}).whatsappHref).toBeNull();
    expect(buildAskBuyer({ whatsapp_number: "   " }).whatsappHref).toBeNull();
    expect(buildAskBuyer({ whatsapp_number: 233 }).whatsappHref).toBeNull();
    expect(
      buildAskBuyer({ whatsapp_number: "no digits here" }).whatsappHref,
    ).toBeNull();
  });

  it("treats blank support hours as absent, not as an empty clause", () => {
    expect(buildAskBuyer({ support_hours: "  " }).supportHours).toBeNull();
  });
});

describe("buildFreightBox", () => {
  const box = {
    id: "b1", label: "Box 1", region_code: "USA", region_name: "United States",
    departs_at: "2026-09-18T00:00:00.000Z", cutoff_at: "2026-09-17T00:00:00.000Z",
    capacity_lbs: 9, weight_lbs: 5.4, fill_pct: 60, headroom_lbs: 3.6,
    line_ids: ["a", "b"], freight_ghs: 435, saving_ghs: 87,
    marginal_saving_ghs: 43.5, item_count: 2, unweighed_line_count: 0, has_unweighed_lines: false,
  };
  const bag = (boxes: BagView["boxes"]) => ({ boxes }) as BagView;

  it("hands the card the bag's first box, figure for figure", () => {
    expect(buildFreightBox(bag([box]))).toEqual({
      label: "Box 1",
      departsAt: "2026-09-18T00:00:00.000Z",
      fillPct: 60,
      weightLbs: 5.4,
      capacityLbs: 9,
      itemCount: 2,
      unweighedLineCount: 0,
      marginalSavingGhs: 43.5,
      href: "/app/bag",
    });
  });

  it("shows no card when the bag is empty or could not be read", () => {
    expect(buildFreightBox(bag([]))).toBeNull();
    expect(buildFreightBox(null)).toBeNull();
  });
});
