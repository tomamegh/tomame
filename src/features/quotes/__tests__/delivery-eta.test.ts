import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/queries/regions", () => ({ getRegionByCode: vi.fn() }));
vi.mock("@/db/queries/delivery-zones", () => ({ listActiveDeliveryZones: vi.fn() }));
vi.mock("@/db/queries/pricing-constants", () => ({ getPricingConstantsMap: vi.fn() }));

import type { RegionRow } from "@/db/queries/regions";
import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import { pickDefaultDoorZone } from "@/features/delivery/zones";
import { estimateDeliveryWindow } from "../services/delivery-eta.service";

const constants = { purchase_lead_days_min: 1, purchase_lead_days_max: 3 };

function region(overrides: Partial<RegionRow> = {}): RegionRow {
  return {
    code: "USA", name: "United States", status: "live", hub_city: "Newark",
    transit_days_min: 14, transit_days_max: 18, store_names: [], tag_names: [],
    blurb: null, photo_key: null, sort_order: 1, ...overrides,
  };
}

function zone(overrides: Partial<DeliveryZoneRow> = {}): DeliveryZoneRow {
  return { id: "z1", name: "Greater Accra", kind: "door", fee_ghs: 0, extra_days: 0, note: null, sort_order: 1, ...overrides };
}

const today = new Date("2026-09-12T10:00:00Z");

describe("estimateDeliveryWindow", () => {
  it("adds lead + transit + zone days to today on each end", () => {
    expect(estimateDeliveryWindow({ country: "USA", constants, region: region(), zone: zone(), today }))
      .toEqual({ from: "2026-09-27", to: "2026-10-03" });
  });

  it("shifts both ends by the zone's extra days", () => {
    expect(estimateDeliveryWindow({ country: "USA", constants, region: region(), zone: zone({ extra_days: 2 }), today }))
      .toEqual({ from: "2026-09-29", to: "2026-10-05" });
  });

  it("adds no zone days when there is no zone", () => {
    expect(estimateDeliveryWindow({ country: "USA", constants, region: region(), zone: null, today }))
      .toEqual({ from: "2026-09-27", to: "2026-10-03" });
  });

  it("crosses a month boundary correctly", () => {
    expect(estimateDeliveryWindow({ country: "USA", constants, region: region(), zone: null, today: new Date("2026-12-20T00:00:00Z") }))
      .toEqual({ from: "2027-01-04", to: "2027-01-10" });
  });

  it("returns null when the region has no transit days", () => {
    expect(estimateDeliveryWindow({
      country: "UK", constants, region: region({ code: "UK", transit_days_min: null, transit_days_max: null }), zone: zone(), today,
    })).toBeNull();
  });

  it("returns null when the region is missing or for another country", () => {
    expect(estimateDeliveryWindow({ country: "UK", constants, region: null, zone: zone(), today })).toBeNull();
    expect(estimateDeliveryWindow({ country: "UK", constants, region: region(), zone: zone(), today })).toBeNull();
  });
});

describe("pickDefaultDoorZone", () => {
  it("picks the lowest sort_order door zone and ignores pickup", () => {
    const zones = [
      zone({ id: "pickup", kind: "pickup", sort_order: 0 }),
      zone({ id: "kumasi", sort_order: 2 }),
      zone({ id: "accra", sort_order: 1 }),
    ];
    expect(pickDefaultDoorZone(zones)?.id).toBe("accra");
  });

  it("returns null when there is no door zone", () => {
    expect(pickDefaultDoorZone([zone({ kind: "pickup" })])).toBeNull();
    expect(pickDefaultDoorZone([])).toBeNull();
  });
});
