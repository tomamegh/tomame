import { describe, expect, it } from "vitest";

import { compactCount, distinctByTitle, shortCategory } from "../shop-format";

describe("shortCategory", () => {
  it("gives every department a one-line name", () => {
    expect(shortCategory("Cell Phones & Accessories")).toBe("Phones");
    expect(shortCategory("Video Games")).toBe("Games");
    expect(shortCategory("Books")).toBe("Books");
    expect(shortCategory("Garden & Outdoor")).toBe("Garden");
    expect(shortCategory("Industrial and Scientific Supplies")).toBe("Industrial an…");
  });
});

describe("compactCount", () => {
  it("shortens review counts", () => {
    expect(compactCount(87)).toBe("87");
    expect(compactCount(1234)).toBe("1.2k");
    expect(compactCount(2000)).toBe("2k");
    expect(compactCount(1_500_000)).toBe("1.5m");
  });
});

describe("distinctByTitle", () => {
  it("keeps one of each product across colours", () => {
    const items = [
      { title: "Nintendo Switch Lite - Turquoise" },
      { title: "Nintendo Switch Lite - Coral" },
      { title: "Nintendo Switch OLED Model" },
      { title: "PlayStation 5 Pro Console" },
    ];
    expect(distinctByTitle(items).map((i) => i.title)).toEqual([
      "Nintendo Switch Lite - Turquoise",
      "PlayStation 5 Pro Console",
    ]);
    expect(distinctByTitle(items, 3).map((i) => i.title)).toHaveLength(3);
  });
});
