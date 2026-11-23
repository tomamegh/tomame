import { describe, expect, it } from "vitest";

import {
  addItemsWeightProblem,
  capacityFill,
  capacityLine,
  itemWeight,
  packageLoad,
  sealWeightProblem,
  weightNote,
  type LoadLine,
  type WeighableItem,
} from "../weights";

const item = (over: Partial<WeighableItem> = {}): WeighableItem => ({
  order_no: "TM-00001",
  quantity: 1,
  listed_weight_lbs: null,
  received: null,
  ...over,
});
const line = (i: WeighableItem | null, description: string | null = null): LoadLine => ({
  quantity: i?.quantity ?? 1,
  description,
  item: i,
});

const TV = item({ order_no: "TM-00040", title: "Samsung 55-inch TV", listed_weight_lbs: 141.2 });
const CAP = 9;

describe("itemWeight", () => {
  it("prefers the scale, then the listing × quantity, and never invents 0 lb", () => {
    expect(itemWeight(item({ listed_weight_lbs: 2, received: { weight_lbs: 2.4 } }))).toEqual({ lbs: 2.4, source: "scale" });
    expect(itemWeight(item({ listed_weight_lbs: 1.5, quantity: 2 }))).toEqual({ lbs: 3, source: "listed" });
    expect(itemWeight(item({ listed_weight_lbs: 0 }))).toEqual({ lbs: null, source: "none" });
    expect(itemWeight(item({ received: { weight_lbs: null } }))).toEqual({ lbs: null, source: "none" });
  });
});

describe("weightNote", () => {
  it("says weighed, listed, missing or oversize", () => {
    expect(weightNote(item({ received: { weight_lbs: 1.4 } }), CAP)).toEqual({ text: "1.4 lb weighed", tone: "confirmed" });
    expect(weightNote(item({ listed_weight_lbs: 2 }), CAP).tone).toBe("estimate");
    expect(weightNote(item(), CAP).tone).toBe("missing");
    expect(weightNote(TV, CAP)).toEqual({ text: "141.2 lb listed: over a 9 lb box, ships as oversize freight", tone: "over" });
    // Sea freight has no box capacity.
    expect(weightNote(TV, null).tone).toBe("estimate");
  });
});

describe("capacityFill", () => {
  it("shows the true percentage and the overage, not 100% · 0 lb spare", () => {
    expect(capacityFill(141.2, CAP)).toEqual({ pct: 1569, spareLbs: 0, overLbs: 132.2, over: true });
    expect(capacityFill(3.2, CAP)).toEqual({ pct: 36, spareLbs: 5.8, overLbs: 0, over: false });
    expect(capacityFill(9, CAP).over).toBe(false);
    expect(capacityFill(5, null).pct).toBeNull();
    expect(capacityLine(141.2, CAP)).toBe("141.2 of 9 lb · 132.2 lb over");
    expect(capacityLine(3.2, CAP)).toBe("3.2 of 9 lb · 5.8 lb spare");
  });
});

describe("sealWeightProblem", () => {
  const weighed = item({ received: { weight_lbs: 2 } });

  it("blocks a package with no confirmed weight and no override", () => {
    const load = packageLoad({ weight_lbs: null, lines: [line(item({ listed_weight_lbs: 2 }))] }, CAP);
    expect(load.confirmed).toBe(false);
    expect(sealWeightProblem(load)).toMatch(/Weigh the package/);
    expect(sealWeightProblem(load, { estimateReason: "Scale broken" })).toBeNull();
    expect(sealWeightProblem(packageLoad({ weight_lbs: 2.1, lines: [line(weighed)] }, CAP))).toBeNull();
  });

  it("counts a package whose every item was weighed on arrival as confirmed", () => {
    const listedOnly = item({ order_no: "TM-00004", listed_weight_lbs: 1 });
    expect(packageLoad({ weight_lbs: null, lines: [line(weighed), line(weighed)] }, CAP).confirmedBy).toBe("items");
    const mixed = packageLoad({ weight_lbs: null, lines: [line(weighed), line(listedOnly)] }, CAP);
    expect(mixed.confirmed).toBe(false);
    expect(packageLoad({ weight_lbs: null, lines: [line(weighed), line(null, "Charger")] }, CAP).confirmed).toBe(false);
  });

  it("flags a 0 lb item and lets no reason through it", () => {
    const load = packageLoad({ weight_lbs: 3, lines: [line(weighed), line(item({ order_no: "TM-00051" }))] }, CAP);
    expect(load.missing).toEqual(["TM-00051"]);
    expect(load.contentsLbs).toBe(2);
    const problem = sealWeightProblem(load, { estimateReason: "x", capacityReason: "y" });
    expect(problem).toMatch(/^TM-00051 has no weight/);
  });

  it("blocks over capacity without a reason and shows it as over, not full", () => {
    const heavy = item({ order_no: "TM-00002", received: { weight_lbs: 6 } });
    const load = packageLoad({ weight_lbs: 12, lines: [line(weighed), line(heavy)] }, CAP);
    expect(load.fill).toMatchObject({ over: true, overLbs: 3, pct: 133 });
    expect(sealWeightProblem(load)).toMatch(/3 lb over the 9 lb box/);
    expect(sealWeightProblem(load, { capacityReason: "Customer asked for one box" })).toBeNull();
  });

  it("lets an oversize item seal alone, and stops it travelling with others", () => {
    const alone = packageLoad({ weight_lbs: 140, lines: [line(TV)] }, CAP);
    expect(alone.oversize).toBe(true);
    expect(sealWeightProblem(alone)).toBeNull();

    const mixed = packageLoad({ weight_lbs: 143, lines: [line(TV), line(weighed)] }, CAP);
    expect(mixed.oversizeMixed).toEqual(["TM-00040"]);
    expect(sealWeightProblem(mixed)).toMatch(/oversize freight/);
  });
});

describe("addItemsWeightProblem", () => {
  const empty = packageLoad({ weight_lbs: null, lines: [] }, CAP);
  const small = item({ order_no: "TM-00003", listed_weight_lbs: 2 });

  it("will not put a 141.2 lb TV in a 9 lb box with other things without a reason", () => {
    const withSmall = packageLoad({ weight_lbs: null, lines: [line(small)] }, CAP);
    expect(addItemsWeightProblem(withSmall, [line(TV)])).toMatch(/TM-00040 is over a 9 lb box/);
    expect(addItemsWeightProblem(withSmall, [line(TV)], "Manager approved")).toBeNull();
    expect(addItemsWeightProblem(empty, [line(TV), line(small)])).toMatch(/oversize freight/);
  });

  it("routes a TV alone to its own oversize package, and keeps others out of it", () => {
    expect(addItemsWeightProblem(empty, [line(TV)])).toBeNull();
    const tvPackage = packageLoad({ weight_lbs: null, lines: [line(TV)] }, CAP);
    expect(addItemsWeightProblem(tvPackage, [line(small)])).toMatch(/oversize item on its own/);
  });

  it("stops contents going over capacity", () => {
    const seven = packageLoad({ weight_lbs: null, lines: [line(item({ listed_weight_lbs: 7 }))] }, CAP);
    expect(addItemsWeightProblem(seven, [line(small)])).toBeNull();
    expect(addItemsWeightProblem(seven, [line(item({ order_no: "TM-9", listed_weight_lbs: 3 }))])).toMatch(/1 lb over the 9 lb box/);
  });

  it("lets unknown weights in (they block the seal instead) and ignores sea freight", () => {
    expect(addItemsWeightProblem(empty, [line(item())])).toBeNull();
    const sea = packageLoad({ weight_lbs: null, lines: [line(small)] }, null);
    expect(addItemsWeightProblem(sea, [line(TV)])).toBeNull();
  });
});
