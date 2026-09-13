import { describe, expect, it, vi } from "vitest";

// The service is server-only and reaches for Supabase at module scope through
// its imports; the window arithmetic under test needs none of it.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { resolveWindow } from "../admin-eta.service";

/**
 * The midpoint is the only arithmetic in the ETA service, and it has to agree
 * with `resolveEtaWindow` in `orders.service.ts` — the two write the same three
 * columns, so a disagreement would make an order's stored date depend on which
 * screen last touched it.
 */
describe("resolveWindow", () => {
  it("keeps both ends and derives the midpoint", () => {
    expect(resolveWindow({ eta_from: "2026-09-18", eta_to: "2026-09-20" })).toEqual({
      eta_from: "2026-09-18",
      eta_to: "2026-09-20",
      estimated_delivery_date: "2026-09-19",
    });
  });

  it("rounds an even-length window DOWN, so the promise is never optimistic", () => {
    expect(
      resolveWindow({ eta_from: "2026-09-18", eta_to: "2026-09-21" }).estimated_delivery_date,
    ).toBe("2026-09-19");
  });

  it("treats a single day as a one-day window rather than inventing a spread", () => {
    expect(resolveWindow({ eta_from: "2026-09-18", eta_to: "2026-09-18" })).toEqual({
      eta_from: "2026-09-18",
      eta_to: "2026-09-18",
      estimated_delivery_date: "2026-09-18",
    });
  });

  it("stores a half-open window as given, and dates it by the end it has", () => {
    expect(resolveWindow({ eta_from: "2026-09-18" })).toEqual({
      eta_from: "2026-09-18",
      eta_to: null,
      estimated_delivery_date: "2026-09-18",
    });
    expect(resolveWindow({ eta_to: "2026-09-20" })).toEqual({
      eta_from: null,
      eta_to: "2026-09-20",
      estimated_delivery_date: "2026-09-20",
    });
  });

  it("clears all three columns when neither end is given", () => {
    expect(resolveWindow({})).toEqual({
      eta_from: null,
      eta_to: null,
      estimated_delivery_date: null,
    });
    expect(resolveWindow({ eta_from: "   ", eta_to: "" }).eta_from).toBeNull();
  });

  it("crosses a month boundary without drifting", () => {
    expect(
      resolveWindow({ eta_from: "2026-09-28", eta_to: "2026-10-02" }).estimated_delivery_date,
    ).toBe("2026-09-30");
  });
});
