import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { describeFeeSpread } from "../services/marketing-content.service";

/**
 * The qualifier beside "We charge 5% of the item price" on /fees.
 *
 * It used to say "from 4%" and stop there, while the same function held
 * `range.max`. Release QA (2026-09-15) priced a 6% item against a page whose
 * published range topped out at 5% and filed it; the seeded engine actually
 * spans 4–8%.
 */
describe("describeFeeSpread", () => {
  it("names the ceiling, not just the floor, for the seeded engine", () => {
    expect(describeFeeSpread({ min: 0.04, max: 0.08 }, 0.05)).toBe(
      "4%–8%, depending on the category",
    );
  });

  it("still names a span that sits entirely above the headline", () => {
    // The old rule was `range.min < defaultPct`, so a 6–8% engine published a
    // bare "5%" with no qualifier at all — the worst version of this bug.
    expect(describeFeeSpread({ min: 0.06, max: 0.08 }, 0.05)).toBe(
      "6%–8%, depending on the category",
    );
  });

  it("says nothing when every category really does charge the headline", () => {
    expect(describeFeeSpread({ min: 0.05, max: 0.05 }, 0.05)).toBeNull();
  });

  it("corrects the headline when one rate applies but it is not the headline", () => {
    expect(describeFeeSpread({ min: 0.06, max: 0.06 }, 0.05)).toBe("6% on every category");
  });

  it("has nothing to say with no active groups", () => {
    expect(describeFeeSpread(null, 0.05)).toBeNull();
  });

  it("does not invent precision on a fractional band", () => {
    expect(describeFeeSpread({ min: 0.045, max: 0.075 }, 0.05)).toBe(
      "4.5%–7.5%, depending on the category",
    );
  });
});
