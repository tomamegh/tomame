import { describe, it, expect } from "vitest";
import { buildBagSummaryRows, formatBoxFill, formatBoxHeadroom, formatBoxTitle, formatDepartureDay, formatLbs, formatLockCountdown } from "../components/format";
import type { BagBox, BagView } from "../types";

const box: BagBox = { id: "b", label: "Box 1", region_code: "USA", region_name: "United States", departs_at: "2026-09-18T00:00:00.000Z", cutoff_at: null, capacity_lbs: 9, weight_lbs: 5.4, fill_pct: 60, headroom_lbs: 3.6, line_ids: [], freight_ghs: 0, saving_ghs: 0, has_unweighed_lines: false };

describe("box copy", () => {
  it("names the departure day and the fill from the server's numbers", () => {
    expect(formatDepartureDay(box.departs_at)).toBe("Fri 18 Sep");
    expect(formatBoxTitle(box)).toBe("Box 1 · flies from the US Fri 18 Sep");
    expect(formatBoxTitle({ ...box, departs_at: null })).toBe("Box 1 · from the US");
    expect(formatBoxFill(box)).toBe("5.4 / 9 lb");
    expect(formatLbs(0.6)).toBe("0.6 lb");
    expect(formatLbs(21.8)).toBe("21.8 lb");
  });
  it("headroom copy is honest about full boxes and unknown weights", () => {
    expect(formatBoxHeadroom(box)).toBe("Room for ~3.6 lb more. Anything else from your price watch?");
    expect(formatBoxHeadroom({ ...box, headroom_lbs: 0 })).toMatch(/full/);
    expect(formatBoxHeadroom({ ...box, has_unweighed_lines: true })).toMatch(/confirmed/);
  });
});

describe("formatLockCountdown", () => {
  it("counts down hours and minutes and disappears once lapsed", () => {
    const now = new Date("2026-09-13T10:00:00Z");
    expect(formatLockCountdown("2026-09-14T09:12:30Z", now)).toBe("23h 12m");
    expect(formatLockCountdown("2026-09-13T10:05:00Z", now)).toBe("5m");
    expect(formatLockCountdown("2026-09-13T09:00:00Z", now)).toBeNull();
    expect(formatLockCountdown(null, now)).toBeNull();
  });
});

describe("buildBagSummaryRows", () => {
  const view: BagView = {
    cart_id: "c", lines: [], boxes: [box], unboxed_line_ids: [], consolidation_saving_ghs: 96, consolidation_saving_pct: 0.2, item_count: 2,
    subtotal_usd: 817, tax_usd: 65.36, fee_usd: 40.85, freight_ghs: 264, boxed_weight_lbs: 5.4, total_ghs: 13489.66, total_usd: 934.84,
    rate_locked_until: null, has_unpriced_lines: false,
  };
  it("prints the mock's rows from the view, with the saving only when non-zero", () => {
    const rows = buildBagSummaryRows(view, { id: "z", name: "Greater Accra · door delivery", kind: "door", fee_ghs: 0, extra_days: 0, note: null, sort_order: 1 });
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["2 items", "$817.00"],
      ["Sales tax", "$65.36"],
      ["Tomame fee", "$40.85"],
      ["Freight · 1 box, 5.4 lb", "GH₵264.00"],
      ["Consolidation saving", "− GH₵96.00"],
      ["Greater Accra · door delivery", "Free"],
    ]);
    expect(buildBagSummaryRows({ ...view, consolidation_saving_ghs: 0 }, null).some((r) => r.key === "saving")).toBe(false);
  });
});
