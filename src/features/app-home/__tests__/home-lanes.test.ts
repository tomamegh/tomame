import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

// `buildLanes` / `buildAskBuyer` are pure, but they live beside `getHomeView`,
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
vi.mock("@/db/queries/extraction-requests", () => ({
  getLatestExtractionRequest: vi.fn(),
}));
vi.mock("@/db/queries/extraction-cache", () => ({
  getExtractionById: vi.fn(),
  getCachedExtractionByHash: vi.fn(),
}));
vi.mock("@/db/queries/regions", () => ({ listRegions: vi.fn() }));
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

import type { RegionRow, RegionStatus } from "@/db/queries/regions";
import {
  LANE_WAITLIST_HREF,
  buildAskBuyer,
  buildLanes,
} from "../services/home.service";

/**
 * The lane card's copy is assembled from `regions` rows, so these are the tests
 * that stop "14–18 days" or "UK and China" from silently going stale the day an
 * admin edits a lane.
 */

function region(
  code: string,
  status: RegionStatus,
  overrides: Partial<RegionRow> = {},
): RegionRow {
  return {
    code,
    name: code,
    status,
    hub_city: null,
    transit_days_min: null,
    transit_days_max: null,
    store_names: [],
    tag_names: [],
    blurb: null,
    photo_key: null,
    sort_order: 0,
    ...overrides,
  };
}

/** Exactly what `036`/`037` seed today. */
const USA_LIVE = region("USA", "live", {
  name: "United States",
  transit_days_min: 14,
  transit_days_max: 18,
});

const SEEDED: RegionRow[] = [
  USA_LIVE,
  region("UK", "soon", { name: "United Kingdom" }),
  region("CHINA", "soon", { name: "China" }),
];

describe("buildLanes — one live lane, two coming soon (the seeded state)", () => {
  it("reproduces the mock's copy entirely from the rows", () => {
    const lanes = buildLanes(SEEDED);

    expect(lanes?.heading).toBe("Shipping from the USA");
    expect(lanes?.body).toBe(
      "Any US store, 14–18 days to Accra. UK and China lanes are coming soon — get notified.",
    );
    expect(lanes?.waitlist).toEqual({
      label: "Join the UK / China waitlist",
      href: LANE_WAITLIST_HREF,
    });
  });

  it("moves with the data instead of hardcoding the band", () => {
    const lanes = buildLanes([
      region("USA", "live", { transit_days_min: 9, transit_days_max: 12 }),
      region("UK", "soon"),
      region("CHINA", "soon"),
    ]);

    expect(lanes?.body).toContain("9–12 days to Accra.");
  });
});

describe("buildLanes — one lane coming soon", () => {
  it("names only that lane, in the singular", () => {
    const lanes = buildLanes([USA_LIVE, region("UK", "soon")]);

    expect(lanes?.body).toBe(
      "Any US store, 14–18 days to Accra. The UK lane is coming soon — get notified.",
    );
    expect(lanes?.waitlist?.label).toBe("Join the UK waitlist");
  });

  it("ignores lanes an admin has switched off", () => {
    const lanes = buildLanes([
      USA_LIVE,
      region("UK", "soon"),
      region("CHINA", "off"),
    ]);

    expect(lanes?.body).toContain("The UK lane is coming soon");
    expect(lanes?.body).not.toContain("China");
  });
});

describe("buildLanes — no lane coming soon", () => {
  it("drops the clause and the waitlist link entirely", () => {
    const lanes = buildLanes([USA_LIVE]);

    expect(lanes?.body).toBe("Any US store, 14–18 days to Accra.");
    expect(lanes?.waitlist).toBeNull();
  });
});

describe("buildLanes — edge cases", () => {
  it("renders nothing when no lane is live: only a live lane is purchasable", () => {
    expect(
      buildLanes([region("UK", "soon"), region("CHINA", "soon")]),
    ).toBeNull();
    expect(buildLanes([])).toBeNull();
  });

  it("covers both lanes when two are open, and spans their transit bands", () => {
    const lanes = buildLanes([
      region("USA", "live", { transit_days_min: 14, transit_days_max: 18 }),
      region("UK", "live", { transit_days_min: 7, transit_days_max: 10 }),
      region("CHINA", "soon"),
    ]);

    expect(lanes?.heading).toBe("Shipping from the USA and the UK");
    expect(lanes?.body).toBe(
      "Any US or UK store, 7–18 days to Accra. The China lane is coming soon — get notified.",
    );
  });

  it("omits the timing clause rather than inventing one when no band is published", () => {
    const lanes = buildLanes([region("USA", "live"), region("UK", "soon")]);

    expect(lanes?.body).toBe(
      "Any US store, delivered to your door in Accra. The UK lane is coming soon — get notified.",
    );
  });

  it("collapses an equal min and max to a single figure", () => {
    const lanes = buildLanes([
      region("USA", "live", { transit_days_min: 16, transit_days_max: 16 }),
    ]);

    expect(lanes?.body).toBe("Any US store, 16 days to Accra.");
  });

  it("falls back to the admin's own region name for an unknown code", () => {
    const lanes = buildLanes([
      region("CANADA", "live", {
        name: "Canada",
        transit_days_min: 12,
        transit_days_max: 15,
      }),
    ]);

    expect(lanes?.heading).toBe("Shipping from Canada");
    expect(lanes?.body).toBe("Any Canada store, 12–15 days to Accra.");
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
