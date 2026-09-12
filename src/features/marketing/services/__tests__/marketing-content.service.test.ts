import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The service is only imported for its pure error classifier here; stub the
// data layer so no module tries to reach Supabase or the FX provider.
vi.mock("@/db/queries/site-content", () => ({
  getSiteContentByKind: vi.fn(),
  getSiteContentByKinds: vi.fn(),
}));
vi.mock("@/db/queries/site-settings", () => ({ getSiteSettingsMap: vi.fn() }));
vi.mock("@/db/queries/regions", () => ({ listRegions: vi.fn() }));
vi.mock("@/db/queries/delivery-zones", () => ({
  listActiveDeliveryZones: vi.fn(),
}));
vi.mock("@/db/queries/pricing-constants", () => ({
  getPricingConstantsMap: vi.fn(),
}));
vi.mock("@/db/queries/pricing-groups", () => ({ getAllPricingGroups: vi.fn() }));
vi.mock("@/lib/exchange-rates/service", () => ({ getGhsRate: vi.fn() }));

import { isSchemaMissingError } from "@/lib/supabase/errors";

describe("isSchemaMissingError", () => {
  it("flags a PostgREST PGRST205 schema-cache miss", () => {
    expect(
      isSchemaMissingError({
        code: "PGRST205",
        message:
          "Could not find the table 'public.site_settings' in the schema cache",
      }),
    ).toBe(true);
  });

  it("flags PGRST205 after db/queries has flattened it into a plain Error", () => {
    // What the service actually receives: `code` is gone, message only.
    expect(
      isSchemaMissingError(
        new Error(
          "Failed to load site settings: Could not find the table 'public.site_settings' in the schema cache",
        ),
      ),
    ).toBe(true);
  });

  it("flags Postgres SQLSTATE 42P01 (undefined_table)", () => {
    expect(
      isSchemaMissingError({
        code: "42P01",
        message: 'relation "site_settings" does not exist',
      }),
    ).toBe(true);
  });

  it("flags a 42P01 message with no code attached", () => {
    expect(
      isSchemaMissingError(
        new Error('Failed to load regions: relation "regions" does not exist'),
      ),
    ).toBe(true);
  });

  it("does NOT flag a network timeout — that is a transient blip", () => {
    const timeout = Object.assign(new Error("fetch failed: ETIMEDOUT"), {
      code: "ETIMEDOUT",
    });
    expect(isSchemaMissingError(timeout)).toBe(false);
  });

  it("does NOT flag a generic error", () => {
    expect(isSchemaMissingError(new Error("something went wrong"))).toBe(false);
  });

  it("does NOT flag a permission failure or a non-error value", () => {
    expect(
      isSchemaMissingError({
        code: "42501",
        message: "permission denied for table site_settings",
      }),
    ).toBe(false);
    expect(isSchemaMissingError(null)).toBe(false);
    expect(isSchemaMissingError(undefined)).toBe(false);
    expect(isSchemaMissingError("boom")).toBe(false);
  });
});
