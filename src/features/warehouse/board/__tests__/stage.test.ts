import { describe, expect, it } from "vitest";

import { BOARD_STAGES, boardStageOf, countByStage, type BoardStageInput } from "../stage";

const ev = (kind: string, at = "2026-11-20T10:00:00Z") => ({ kind, title: kind, detail: null, location: null, occurred_at: at });
const base: BoardStageInput = { order_status: "paid", received: false, has_tracking: false, package_status: null, events: [] };

describe("boardStageOf", () => {
  it("puts a paid order nobody has bought under Paid, not bought", () => {
    expect(boardStageOf(base)).toBe("to_buy");
  });

  it("splits purchased orders by whether the store gave tracking", () => {
    expect(boardStageOf({ ...base, order_status: "processing" })).toBe("purchased");
    expect(boardStageOf({ ...base, order_status: "processing", has_tracking: true })).toBe("on_way");
  });

  it("puts a logged-in parcel at the hub, tracking or not", () => {
    expect(boardStageOf({ ...base, order_status: "processing", received: true })).toBe("at_hub");
    expect(boardStageOf({ ...base, order_status: "processing", received: true, has_tracking: true })).toBe("at_hub");
  });

  it("puts anything in an unshipped box under Boxed", () => {
    expect(boardStageOf({ ...base, order_status: "processing", received: true, package_status: "packing" })).toBe("boxed");
    expect(boardStageOf({ ...base, order_status: "processing", received: true, package_status: "sealed" })).toBe("boxed");
  });

  it("ignores a voided package", () => {
    expect(boardStageOf({ ...base, order_status: "processing", received: true, package_status: "voided" })).toBe("at_hub");
  });

  it("follows the shipment ladder once it has left", () => {
    const shipped = { ...base, order_status: "in_transit", received: true, package_status: "shipped" as const };
    expect(boardStageOf({ ...shipped, events: [ev("departed")] })).toBe("in_flight");
    expect(boardStageOf(shipped)).toBe("in_flight");
    expect(boardStageOf({ ...shipped, events: [ev("departed"), ev("arrived_country")] })).toBe("in_accra");
    expect(boardStageOf({ ...shipped, events: [ev("ghana_warehouse")] })).toBe("in_accra");
    expect(boardStageOf({ ...shipped, events: [ev("ready_for_pickup")] })).toBe("out");
    expect(boardStageOf({ ...shipped, events: [ev("out_for_delivery")] })).toBe("out");
  });

  it("calls delivered and completed orders Delivered", () => {
    expect(boardStageOf({ ...base, order_status: "delivered" })).toBe("delivered");
    expect(boardStageOf({ ...base, order_status: "completed" })).toBe("delivered");
  });

  it("leaves unpaid and cancelled orders off the board", () => {
    expect(boardStageOf({ ...base, order_status: "pending_payment" })).toBeNull();
    expect(boardStageOf({ ...base, order_status: "cancelled" })).toBeNull();
  });
});

describe("countByStage", () => {
  it("counts every stage, zero included, from the list itself", () => {
    const counts = countByStage([{ board_stage: "to_buy" }, { board_stage: "to_buy" }, { board_stage: "boxed" }]);
    expect(Object.keys(counts)).toEqual([...BOARD_STAGES]);
    expect(counts.to_buy).toBe(2);
    expect(counts.boxed).toBe(1);
    expect(counts.delivered).toBe(0);
  });
});
