import { describe, expect, it } from "vitest";

import {
  collapseRepeats,
  describeEntry,
  formatWeight,
  humanFields,
  pageName,
  referencedIds,
  sentenceText,
  type DescribeContext,
  type DescribeInput,
} from "../describe";

const ORDER = "df5ec16a-f3c1-4b2b-8a18-53eb54f8ab28";
const PKG = "76b3c3b1-d323-43db-87c2-919e3c57fa6f";

const ctx: DescribeContext = {
  orderNos: new Map([[ORDER, "TM-00005"]]),
  packageRefs: new Map([[PKG, "PKG-10001"]]),
};

function audit(action: string, extra: Partial<DescribeInput> = {}): DescribeInput {
  return { source: "audit", action, entity_type: null, entity_id: null, path: null, metadata: {}, ...extra };
}

function say(row: DescribeInput, actor = "Yaw"): string {
  return sentenceText(actor, describeEntry(row, ctx).segments);
}

describe("describeEntry — audit rows", () => {
  it("logs a parcel in with its weight", () => {
    const row = audit("warehouse_item_received", {
      entity_type: "order",
      entity_id: ORDER,
      metadata: { order_no: "TM-00005", weight_lbs: 0.8, location: "US hub" },
    });
    expect(say(row)).toBe("Yaw logged in TM-00005 at 0.8 lb");
    const d = describeEntry(row, ctx);
    expect(d.segments[1]).toEqual({ ref: "TM-00005", href: `/warehouse/items/${ORDER}` });
    expect(d.note).toBeNull();
    expect(d.tone).toBe("green");
  });

  it("says when there was no weight, and names an unusual location", () => {
    const row = audit("warehouse_item_received", {
      entity_type: "order",
      entity_id: ORDER,
      metadata: { order_no: "TM-00005", weight_lbs: null, location: "Dock 2" },
    });
    expect(say(row)).toBe("Yaw logged in TM-00005 without a weight");
    expect(describeEntry(row, ctx).note).toBe("At Dock 2");
  });

  it("falls back to the order number in metadata when the order is gone", () => {
    const row = audit("warehouse_item_reweighed", {
      entity_type: "order",
      entity_id: "00000000-0000-4000-8000-000000000000",
      metadata: { order_no: "TM-00099", weight_lbs: 2 },
    });
    expect(say(row)).toBe("Yaw re-weighed TM-00099 at 2 lb");
  });

  it("ships a package via a carrier, with the tracking number as the note", () => {
    const row = audit("warehouse_package_shipped", {
      entity_type: "warehouse_package",
      entity_id: PKG,
      metadata: { reference: "PKG-10001", carrier: "UPS", order_count: 3, tracking_number: "1ZB36" },
    });
    expect(say(row)).toBe("Yaw shipped PKG-10001 via UPS · 3 orders");
    const d = describeEntry(row, ctx);
    expect(d.segments[1]).toEqual({ ref: "PKG-10001", href: `/warehouse/packages/${PKG}` });
    expect(d.note).toBe("Tracking 1ZB36");
  });

  it("does not link a package that no longer exists", () => {
    const row = audit("warehouse_package_deleted", {
      entity_type: "warehouse_package",
      entity_id: "11111111-1111-4111-8111-111111111111",
      metadata: { reference: "PKG-10009" },
    });
    expect(say(row)).toBe("Yaw deleted PKG-10009");
    expect(describeEntry(row, ctx).segments[1]).toEqual({ ref: "PKG-10009", href: null });
  });

  it("names a single packed order and counts several", () => {
    const one = audit("warehouse_package_items_added", {
      entity_type: "warehouse_package",
      entity_id: PKG,
      metadata: { reference: "PKG-10001", order_ids: [ORDER], custom_lines: 0 },
    });
    expect(say(one)).toBe("Yaw packed TM-00005 into PKG-10001");
    const many = audit("warehouse_package_items_added", {
      entity_type: "warehouse_package",
      entity_id: PKG,
      metadata: { reference: "PKG-10001", order_ids: [ORDER], custom_lines: 1 },
    });
    expect(say(many)).toBe("Yaw packed 2 items into PKG-10001");
  });

  it("collapses dimension fields when a package is updated", () => {
    const row = audit("warehouse_package_updated", {
      entity_type: "warehouse_package",
      entity_id: PKG,
      metadata: { reference: "PKG-10001", fields: ["weight_lbs", "length_in", "width_in", "height_in", "carrier"] },
    });
    expect(say(row)).toBe("Yaw updated PKG-10001 (weight, dimensions and carrier)");
  });

  it("only mentions a label copy number past the first", () => {
    const first = audit("warehouse_label_printed", { entity_type: "warehouse_package", entity_id: PKG, metadata: { copy: 1 } });
    const third = audit("warehouse_label_printed", { entity_type: "warehouse_package", entity_id: PKG, metadata: { copy: 3 } });
    expect(say(first)).toBe("Yaw printed the label for PKG-10001");
    expect(say(third)).toBe("Yaw printed the label for PKG-10001 (copy 3)");
  });

  it("reads status changes, holds and feedback", () => {
    expect(
      say(audit("order_status_changed", { entity_type: "order", entity_id: ORDER, metadata: { from: "processing", to: "in_transit" } })),
    ).toBe("Yaw moved TM-00005 to in transit");
    const hold = audit("order_held", { entity_type: "order_hold", entity_id: ORDER, metadata: { reason: "Wrong colour" } });
    expect(say(hold)).toBe("Yaw put a hold on TM-00005");
    expect(describeEntry(hold, ctx).note).toBe("Wrong colour");
    expect(
      say(audit("order_feedback_updated", { entity_type: "order_feedback", entity_id: "x", metadata: { order_id: ORDER, to: "resolved" } })),
    ).toBe("Yaw marked a customer issue on TM-00005 as resolved");
    expect(say(audit("order_photo_uploaded", { metadata: { orderId: ORDER, orderNo: "TM-00005" } }))).toBe(
      "Yaw photographed TM-00005",
    );
  });

  it("reports a partial ship with each failure", () => {
    const row = audit("warehouse_package_ship_partial", {
      entity_type: "warehouse_package",
      entity_id: PKG,
      metadata: { failed: [{ order_no: "TM-00003", reason: "On hold" }] },
    });
    expect(say(row)).toBe("Yaw tried to ship PKG-10001 but 1 order could not move");
    expect(describeEntry(row, ctx).note).toBe("TM-00003: On hold");
    expect(describeEntry(row, ctx).tone).toBe("amber");
  });

  it("survives a row with no metadata at all", () => {
    expect(say(audit("warehouse_package_shipped", { metadata: null }))).toBe("Yaw shipped a package");
    expect(say(audit("user_logged_in", { metadata: null }))).toBe("Yaw signed in");
    expect(say(audit("warehouse_something_new"))).toBe("Yaw something new");
  });
});

describe("describeEntry — activity rows", () => {
  const act = (action: string, extra: Partial<DescribeInput> = {}): DescribeInput => ({
    ...audit(action, extra),
    source: "activity",
  });

  it("names the screen a page view opened", () => {
    expect(say(act("page_view", { path: "/warehouse/scan" }))).toBe("Yaw opened the scan console");
    expect(say(act("page_view", { path: `/warehouse/packages/${PKG}` }))).toBe("Yaw opened PKG-10001");
    expect(say(act("page_view", { path: `/warehouse/items/${ORDER}` }))).toBe("Yaw opened TM-00005");
  });

  it("reads a scan and a failed lookup", () => {
    expect(
      say(act("scan", { entity_type: "warehouse_package", entity_id: PKG, metadata: { code: "PKG-10001" } })),
    ).toBe("Yaw scanned PKG-10001");
    const failed = act("lookup_failed", { metadata: { code: "PKG-99999", raw: "pkg 99999" } });
    expect(say(failed)).toBe("Yaw scanned “PKG-99999” but nothing matched");
    expect(describeEntry(failed, ctx).tone).toBe("amber");
    expect(describeEntry(failed, ctx).note).toBe("Typed or read as “pkg 99999”");
  });

  it("reads a label view with its size", () => {
    const row = act("label_view", { entity_type: "warehouse_package", entity_id: PKG, metadata: { code: "PKG-10001", size: "4x6" } });
    expect(say(row)).toBe("Yaw opened the label for PKG-10001");
    expect(describeEntry(row, ctx).note).toBe("4x6 label");
  });
});

describe("helpers", () => {
  it("formats weights without trailing zeros", () => {
    expect(formatWeight(0.8)).toBe("0.8 lb");
    expect(formatWeight(12)).toBe("12 lb");
    expect(formatWeight(1.256)).toBe("1.26 lb");
  });

  it("joins field names in English", () => {
    expect(humanFields(["carrier"])).toBe("carrier");
    expect(humanFields(["fragile", "keep_dry"])).toBe("handling marks");
    expect(humanFields([])).toBeNull();
  });

  it("names unknown paths by the path itself", () => {
    expect(pageName("/warehouse/", ctx).label).toBe("the dashboard");
    expect(pageName("/warehouse/somewhere", ctx)).toEqual({ label: "/warehouse/somewhere", href: "/warehouse/somewhere", isRef: false });
  });

  it("collects every id a row names", () => {
    expect(
      referencedIds(audit("warehouse_package_items_added", { entity_type: "warehouse_package", entity_id: PKG, metadata: { order_ids: [ORDER, "junk"] } })),
    ).toEqual({ orders: [ORDER], packages: [PKG] });
    expect(referencedIds({ ...audit("page_view"), source: "activity", path: `/warehouse/items/${ORDER}` })).toEqual({
      orders: [ORDER],
      packages: [],
    });
  });
});

describe("collapseRepeats", () => {
  const yaw = { id: "yaw" };
  const entry = (action: string, at: string, ref = "PKG-10001", actor = yaw) => ({
    action,
    actor,
    segments: [{ text: "did" }, { ref, href: null }],
    note: null,
    created_at: at,
    repeat: 1,
    earliest_at: at,
  });

  it("folds identical adjacent rows and keeps the run's span", () => {
    const out = collapseRepeats([
      entry("user_logged_in", "2026-09-30T19:04:30Z"),
      entry("user_logged_in", "2026-09-30T19:04:00Z"),
      entry("user_logged_in", "2026-09-30T19:03:00Z"),
      entry("warehouse_package_sealed", "2026-09-30T19:02:00Z"),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ repeat: 3, created_at: "2026-09-30T19:04:30Z", earliest_at: "2026-09-30T19:03:00Z" });
  });

  it("keeps different subjects, people and days apart", () => {
    const out = collapseRepeats([
      entry("warehouse_package_sealed", "2026-09-30T10:00:00Z", "PKG-10001"),
      entry("warehouse_package_sealed", "2026-09-30T09:00:00Z", "PKG-10002"),
      entry("warehouse_package_sealed", "2026-09-30T08:00:00Z", "PKG-10002", { id: "ada" }),
      entry("warehouse_package_sealed", "2026-09-29T08:00:00Z", "PKG-10002", { id: "ada" }),
    ]);
    expect(out.map((r) => r.repeat)).toEqual([1, 1, 1, 1]);
  });
});
