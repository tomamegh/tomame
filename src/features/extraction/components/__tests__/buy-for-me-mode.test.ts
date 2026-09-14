import { describe, expect, it } from "vitest";

import {
  BUY_FOR_ME_PATH,
  buyForMeHref,
  resolveBrowseCategory,
  resolveBuyForMeMode,
} from "../buy-for-me-mode";

describe("resolveBuyForMeMode", () => {
  it("defaults to paste when nothing is asked for", () => {
    expect(resolveBuyForMeMode(undefined)).toBe("paste");
    expect(resolveBuyForMeMode("")).toBe("paste");
  });

  it("opens the browse half only for the browse mode", () => {
    expect(resolveBuyForMeMode("browse")).toBe("browse");
    expect(resolveBuyForMeMode(" BROWSE ")).toBe("browse");
  });

  it("falls back to paste rather than failing on anything unrecognised", () => {
    expect(resolveBuyForMeMode("brows")).toBe("paste");
    expect(resolveBuyForMeMode("../../etc")).toBe("paste");
  });

  it("takes the first value when the parameter repeats", () => {
    expect(resolveBuyForMeMode(["browse", "paste"])).toBe("browse");
  });
});

describe("buyForMeHref", () => {
  it("leaves the paste half at the bare route, the way every existing link into it is written", () => {
    expect(buyForMeHref("paste")).toBe(BUY_FOR_ME_PATH);
    expect(buyForMeHref("paste", "Smart Home")).toBe(BUY_FOR_ME_PATH);
  });

  it("gives the browse half, and each shelf in it, its own address", () => {
    expect(buyForMeHref("browse")).toBe("/app/orders/new?mode=browse");
    expect(buyForMeHref("browse", "Cell Phones & Accessories")).toBe(
      "/app/orders/new?mode=browse&category=Cell+Phones+%26+Accessories",
    );
  });

  it("drops an empty category rather than writing an empty parameter", () => {
    expect(buyForMeHref("browse", "   ")).toBe("/app/orders/new?mode=browse");
    expect(buyForMeHref("browse", null)).toBe("/app/orders/new?mode=browse");
  });
});

describe("resolveBrowseCategory", () => {
  const available = [
    { category: "Cell Phones & Accessories", count: 91 },
    { category: "TV & Video", count: 60 },
  ];

  it("opens the fullest shelf when no category is asked for", () => {
    expect(resolveBrowseCategory(undefined, available)).toBe("Cell Phones & Accessories");
  });

  it("matches a shelf without caring about case", () => {
    expect(resolveBrowseCategory("tv & video", available)).toBe("TV & Video");
  });

  it("falls back to the fullest shelf for a category we do not hold", () => {
    expect(resolveBrowseCategory("Garden Furniture", available)).toBe("Cell Phones & Accessories");
  });

  it("returns null when there is nothing to browse at all", () => {
    expect(resolveBrowseCategory("TV & Video", [])).toBeNull();
  });
});
