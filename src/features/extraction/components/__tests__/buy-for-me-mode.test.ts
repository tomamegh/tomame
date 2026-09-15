import { describe, expect, it } from "vitest";

import {
  BUY_FOR_ME_PATH,
  buyForMeHref,
  looksLikeUrl,
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

  it("opens the concierge form for the ask mode", () => {
    expect(resolveBuyForMeMode("ask")).toBe("ask");
    expect(resolveBuyForMeMode(" ASK ")).toBe("ask");
  });

  it("falls back to paste rather than failing on anything unrecognised", () => {
    expect(resolveBuyForMeMode("brows")).toBe("paste");
    expect(resolveBuyForMeMode("asked")).toBe("paste");
    expect(resolveBuyForMeMode("../../etc")).toBe("paste");
  });

  it("takes the first value when the parameter repeats", () => {
    expect(resolveBuyForMeMode(["browse", "paste"])).toBe("browse");
  });
});

describe("buyForMeHref", () => {
  it("leaves the paste half at the bare route, the way every existing link into it is written", () => {
    expect(buyForMeHref("paste")).toBe(BUY_FOR_ME_PATH);
    expect(buyForMeHref("paste", { category: "Smart Home" })).toBe(BUY_FOR_ME_PATH);
  });

  it("gives the ask form one address, and never a browse shelf's query", () => {
    expect(buyForMeHref("ask")).toBe("/app/orders/new?mode=ask");
    // The form has nothing addressable inside it, so a category or a search term
    // travelling with it would be a parameter nothing over there can open.
    expect(buyForMeHref("ask", { category: "Headphones", q: "earbuds", n: 48 })).toBe(
      "/app/orders/new?mode=ask",
    );
  });

  it("gives the browse half, and each shelf in it, its own address", () => {
    expect(buyForMeHref("browse")).toBe("/app/orders/new?mode=browse");
    expect(buyForMeHref("browse", { category: "Cell Phones & Accessories" })).toBe(
      "/app/orders/new?mode=browse&category=Cell+Phones+%26+Accessories",
    );
  });

  it("drops an empty category rather than writing an empty parameter", () => {
    expect(buyForMeHref("browse", { category: "   " })).toBe("/app/orders/new?mode=browse");
    expect(buyForMeHref("browse", { category: null })).toBe("/app/orders/new?mode=browse");
  });

  it("carries a search, and a category that narrows it, in the same address", () => {
    expect(buyForMeHref("browse", { q: "wireless earbuds" })).toBe(
      "/app/orders/new?mode=browse&q=wireless+earbuds",
    );
    expect(buyForMeHref("browse", { category: "Headphones", q: "earbuds" })).toBe(
      "/app/orders/new?mode=browse&category=Headphones&q=earbuds",
    );
  });

  it("writes the page size only when it is not the first page", () => {
    expect(buyForMeHref("browse", { q: "earbuds", n: 48 })).toBe(
      "/app/orders/new?mode=browse&q=earbuds&n=48",
    );
    expect(buyForMeHref("browse", { q: "earbuds", n: null })).toBe(
      "/app/orders/new?mode=browse&q=earbuds",
    );
    expect(buyForMeHref("browse", { q: "earbuds", n: 0 })).toBe(
      "/app/orders/new?mode=browse&q=earbuds",
    );
  });
});

describe("looksLikeUrl", () => {
  it("takes a link with or without its scheme, which is how people actually paste", () => {
    expect(looksLikeUrl("https://www.amazon.com/dp/B0CHX1W1XY")).toBe(true);
    expect(looksLikeUrl("amazon.com/dp/B0CHX1W1XY")).toBe(true);
    expect(looksLikeUrl("  https://a.co/d/0cTjtuL2  ")).toBe(true);
    expect(looksLikeUrl("www.ebay.co.uk/itm/123456")).toBe(true);
    expect(looksLikeUrl("localhost:3000/app")).toBe(false);
  });

  it("reads ordinary search text as search text, never as a link", () => {
    expect(looksLikeUrl("wireless earbuds")).toBe(false);
    expect(looksLikeUrl("air fryer 5.5l")).toBe(false);
    expect(looksLikeUrl("3.5mm jack")).toBe(false);
    expect(looksLikeUrl("nike")).toBe(false);
    expect(looksLikeUrl("")).toBe(false);
    expect(looksLikeUrl("   ")).toBe(false);
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
