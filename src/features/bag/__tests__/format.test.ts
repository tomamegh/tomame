import { describe, it, expect } from "vitest";
import { buildBagSummaryRows, describePendingWait, formatBoxFill, formatBoxHeadroom, formatBoxTitle, formatDepartureDay, formatLbs, formatLockCountdown, hostOf } from "../components/format";
import type { BagBox, BagDelivery, BagLinePending, BagView } from "../types";

const box: BagBox = { id: "b", label: "Box 1", region_code: "USA", region_name: "United States", departs_at: "2026-09-18T00:00:00.000Z", cutoff_at: null, capacity_lbs: 9, weight_lbs: 5.4, fill_pct: 60, headroom_lbs: 3.6, line_ids: [], freight_ghs: 0, saving_ghs: 0, marginal_saving_ghs: 0, item_count: 2, unweighed_line_count: 0, has_unweighed_lines: false };

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
    expect(formatBoxHeadroom({ ...box, has_unweighed_lines: true, unweighed_line_count: 1 })).toBe(
      "One item's weight is still to be confirmed, so this box may fill sooner.",
    );
    // Two weightless listings must not be described as one: the customer would
    // read it as "the other one is known".
    expect(formatBoxHeadroom({ ...box, has_unweighed_lines: true, unweighed_line_count: 2 })).toBe(
      "2 items' weights are still to be confirmed, so this box may fill sooner.",
    );
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
    delivery: null, delivery_fee_ghs: 0,
    cart_id: "c", lines: [], boxes: [box], unboxed_line_ids: [], consolidation_saving_ghs: 96, consolidation_saving_pct: 0.2, item_count: 2,
    subtotal_usd: 817, tax_usd: 65.36, fee_usd: 40.85, freight_ghs: 264, boxed_weight_lbs: 5.4, total_ghs: 13489.66, total_usd: 934.84,
    rate_locked_until: null, has_unpriced_lines: false, has_pending_lines: false,
  };
  const doorFree: BagDelivery = { kind: "door", address_id: "a1", zone_id: "z1", zone_name: "Greater Accra", label: "Home · East Legon", fee_ghs: 0 };

  it("prints the mock's rows from the view, with the saving only when non-zero", () => {
    const rows = buildBagSummaryRows({ ...view, delivery: doorFree });
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["2 items", "$817.00"],
      ["Sales tax", "$65.36"],
      ["Tomame fee", "$40.85"],
      ["Freight · 1 box, 5.4 lb", "GH₵264.00"],
      ["Consolidation saving", "− GH₵96.00"],
      ["Door delivery · Greater Accra", "Free"],
    ]);
    expect(buildBagSummaryRows({ ...view, consolidation_saving_ghs: 0 }).some((r) => r.key === "saving")).toBe(false);
  });

  const deliveryRow = (v: BagView) => buildBagSummaryRows(v).find((r) => r.key === "delivery")!;

  it("asks for a delivery before quoting one", () => {
    expect(deliveryRow(view)).toMatchObject({ label: "Delivery", value: "choose below", tone: "muted" });
  });

  it("marks a free door zone green and prints a paid one at the server's fee", () => {
    expect(deliveryRow({ ...view, delivery: doorFree })).toMatchObject({ label: "Door delivery · Greater Accra", value: "Free", tone: "free" });
    const paid = { ...doorFree, zone_name: "Kumasi", fee_ghs: 60 };
    expect(deliveryRow({ ...view, delivery: paid })).toMatchObject({ label: "Door delivery · Kumasi", value: "GH₵60.00", tone: undefined });
  });

  it("names a pickup point as a pickup, not a door delivery", () => {
    const pickup: BagDelivery = { kind: "pickup", address_id: null, zone_id: "z9", zone_name: "Osu hub", label: "Osu hub", fee_ghs: 0 };
    expect(deliveryRow({ ...view, delivery: pickup })).toMatchObject({ label: "Pickup · Osu hub", value: "Free", tone: "free" });
  });
});

describe("describePendingWait", () => {
  const at = (queuedSecondsAgo: number, over: Partial<BagLinePending> = {}): BagLinePending => ({
    request_id: "r1",
    status: "running",
    error: null,
    queued_at: new Date(NOW.getTime() - queuedSecondsAgo * 1000).toISOString(),
    ...over,
  });
  const NOW = new Date("2026-09-13T10:00:00.000Z");

  it("says nothing alarming while the wait is still normal", () => {
    const wait = describePendingWait(at(2), NOW);
    expect(wait.phase).toBe("reading");
    expect(wait.detail).toBeNull();
  });

  it("admits it is slow at five seconds and promises to follow up", () => {
    expect(describePendingWait(at(5), NOW).phase).toBe("slow");
    expect(describePendingWait(at(19), NOW).phase).toBe("slow");
    expect(describePendingWait(at(6), NOW).detail).toMatch(/carry on/i);
  });

  it("offers a person at twenty seconds", () => {
    const wait = describePendingWait(at(20), NOW);
    expect(wait.phase).toBe("stuck");
    expect(wait.detail).toMatch(/WhatsApp/);
  });

  it("shows the job's own reason once it has given up", () => {
    const wait = describePendingWait(at(3, { status: "failed", error: "We could not read that page." }), NOW);
    expect(wait.phase).toBe("failed");
    expect(wait.detail).toBe("We could not read that page.");
  });

  it("still says something useful when a failure carried no reason", () => {
    const wait = describePendingWait(at(3, { status: "failed", error: null }), NOW);
    expect(wait.phase).toBe("failed");
    expect(wait.detail).toBeTruthy();
  });

  it("measures from when the paste was queued, not from now", () => {
    // A customer who reloads must not have their wait restart at "reading".
    expect(describePendingWait(at(60), NOW).phase).toBe("stuck");
  });
});

describe("hostOf", () => {
  it("names the store a customer recognises before the product does", () => {
    expect(hostOf("https://www.microcenter.com/product/1")).toBe("microcenter.com");
    expect(hostOf("not a url")).toBe("not a url");
  });
});
