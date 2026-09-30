import { describe, expect, it } from "vitest";

import {
  SIM_REFERENCE,
  initialSimState,
  isSimComplete,
  parseWeight,
  simGoals,
  simPackageWeight,
  simReducer,
  simSealBlocker,
  type SimAction,
  type SimState,
} from "../simulator";

const run = (...actions: SimAction[]): SimState => actions.reduce(simReducer, initialSimState());

const receiveBoth: SimAction[] = [
  { type: "receive", id: "p1", weight: "0.6" },
  { type: "receive", id: "p2", weight: "2.2" },
];
const packBoth: SimAction[] = [...receiveBoth, { type: "toggle", id: "p1" }, { type: "toggle", id: "p2" }, { type: "pack" }];

describe("parseWeight", () => {
  it("reads a scale figure and refuses nothing, zero and junk", () => {
    expect(parseWeight("1.40")).toBe(1.4);
    expect(parseWeight(" 2 ")).toBe(2);
    expect(parseWeight("")).toBeNull();
    expect(parseWeight("0")).toBeNull();
    expect(parseWeight("1.2.3")).toBeNull();
  });
});

describe("practice bench: receiving", () => {
  it("logs a parcel in with its weight and tells the customer", () => {
    const s = run({ type: "receive", id: "p1", weight: "0.6" });
    const p1 = s.parcels.find((p) => p.id === "p1")!;
    expect(p1.stage).toBe("shelf");
    expect(p1.weightLbs).toBe(0.6);
    expect(s.feed[0]).toMatchObject({ customer: "Ama Owusu", title: "Arrived at our US hub", detail: "0.6 lb" });
    expect(s.notice?.tone).toBe("success");
  });

  it("insists on a weight in practice", () => {
    const s = run({ type: "receive", id: "p1", weight: "" });
    expect(s.parcels.find((p) => p.id === "p1")!.stage).toBe("expected");
    expect(s.notice).toMatchObject({ tone: "error", title: "Check the weight" });
  });

  it("records a re-weigh as a re-weigh, and ignores the same figure twice", () => {
    const again = run({ type: "receive", id: "p1", weight: "0.6" }, { type: "receive", id: "p1", weight: "0.6" });
    expect(again.feed).toHaveLength(1);
    const changed = run({ type: "receive", id: "p1", weight: "0.6" }, { type: "receive", id: "p1", weight: "0.7" });
    expect(changed.feed[0]!.title).toBe("Re-weighed at our US hub");
  });
});

describe("practice bench: selecting and packing", () => {
  it("will not select a parcel that was never logged in", () => {
    const s = run({ type: "toggle", id: "p1" });
    expect(s.selected).toEqual([]);
    expect(s.notice?.title).toBe("Log TM-00101 in first");
  });

  it("stops a held parcel and remembers the operator met the hold", () => {
    const s = run({ type: "toggle", id: "p3" });
    expect(s.selected).toEqual([]);
    expect(s.metHold).toBe(true);
    expect(s.notice?.title).toBe("TM-00103 is on hold");
  });

  it("packs the selection into a new package, then adds to the open one", () => {
    const first = run(...receiveBoth, { type: "toggle", id: "p1" }, { type: "pack" });
    expect(first.pkg).toMatchObject({ reference: SIM_REFERENCE, status: "packing", items: ["p1"] });
    expect(first.selected).toEqual([]);
    const second = [{ type: "toggle", id: "p2" } as const, { type: "pack" } as const].reduce(simReducer, first);
    expect(second.pkg!.items).toEqual(["p1", "p2"]);
    expect(second.notice?.title).toBe(`Added to ${SIM_REFERENCE}`);
    expect(simPackageWeight(second)).toBe(2.8);
  });

  it("takes an item out while packing, back to the shelf", () => {
    const s = run(...packBoth, { type: "remove", id: "p2" });
    expect(s.pkg!.items).toEqual(["p1"]);
    expect(s.parcels.find((p) => p.id === "p2")!.stage).toBe("shelf");
  });
});

describe("practice bench: seal, reopen, print, ship", () => {
  it("uses the app's seal blocker words", () => {
    expect(simSealBlocker(initialSimState())).toBe("Pack something first.");
    const emptied = run(...receiveBoth, { type: "toggle", id: "p1" }, { type: "pack" }, { type: "remove", id: "p1" });
    expect(simSealBlocker(emptied)).toBe("Add at least one item first.");
    expect(run({ type: "seal" }).notice?.tone).toBe("error");
  });

  it("freezes the contents once sealed, until reopened", () => {
    const sealed = run(...packBoth, { type: "seal" });
    expect(sealed.pkg!.status).toBe("sealed");
    const blocked = simReducer(sealed, { type: "remove", id: "p1" });
    expect(blocked.pkg!.items).toHaveLength(2);
    expect(blocked.notice?.title).toBe("This package is sealed. Reopen it to change what is inside.");
    const reopened = simReducer(sealed, { type: "reopen" });
    expect(reopened.pkg!.status).toBe("packing");
  });

  it("counts a print on an open box but does not count it as done", () => {
    const s = run(...packBoth, { type: "print" });
    expect(s.pkg!.printCount).toBe(1);
    expect(s.printedSealed).toBe(false);
    expect(s.notice?.tone).toBe("warning");
    const good = [{ type: "seal" } as const, { type: "print" } as const].reduce(simReducer, s);
    expect(good.pkg!.printCount).toBe(2);
    expect(good.printedSealed).toBe(true);
    expect(good.notice?.title).toBe("Label reprinted (×2)");
  });

  it("will not ship an open box, and ships a sealed one to every customer inside", () => {
    expect(run(...packBoth, { type: "ship", carrier: "DHL" }).notice?.title).toBe("Seal the package before shipping it.");
    const shipped = run(...packBoth, { type: "seal" }, { type: "print" }, { type: "ship", carrier: " DHL " });
    expect(shipped.pkg).toMatchObject({ status: "shipped", carrier: "DHL" });
    expect(shipped.parcels.filter((p) => p.stage === "shipped")).toHaveLength(2);
    expect(shipped.feed[0]).toMatchObject({ customer: "Ama Owusu", title: "On its way to Ghana", detail: "DHL" });
    expect(simReducer(shipped, { type: "reopen" }).pkg!.status).toBe("shipped");
  });
});

describe("practice bench: goals", () => {
  it("ticks the six goals in the order the bench does them", () => {
    const at = (state: SimState) => simGoals(state).filter((g) => g.done).map((g) => g.id);
    expect(at(initialSimState())).toEqual([]);
    expect(at(run(...receiveBoth))).toEqual(["receive-1", "receive-2"]);
    expect(at(run(...packBoth))).toEqual(["receive-1", "receive-2", "pack"]);
    expect(at(run(...packBoth, { type: "seal" }))).toEqual(["receive-1", "receive-2", "pack", "seal"]);
    const done = run(...packBoth, { type: "seal" }, { type: "print" }, { type: "ship", carrier: "DHL" });
    expect(isSimComplete(done)).toBe(true);
  });

  it("does not count a box holding only one of Ama's items", () => {
    const s = run(...receiveBoth, { type: "toggle", id: "p1" }, { type: "pack" }, { type: "seal" });
    const goals = simGoals(s);
    expect(goals.find((g) => g.id === "pack")!.done).toBe(false);
    expect(goals.find((g) => g.id === "seal")!.done).toBe(false);
  });

  it("starts over from scratch", () => {
    expect(run(...packBoth, { type: "reset" })).toEqual(initialSimState());
  });
});
