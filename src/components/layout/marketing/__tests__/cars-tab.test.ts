import { describe, expect, it } from "vitest";

import { MARKETING_CARS_NAV_ITEM, MARKETING_NAV_ITEMS, withCarsNavItem } from "../links";

describe("withCarsNavItem", () => {
  it("returns the nav untouched while nothing is published", () => {
    expect(withCarsNavItem(MARKETING_NAV_ITEMS, false)).toBe(MARKETING_NAV_ITEMS);
  });

  it("puts Cars straight after Where we buy", () => {
    expect(withCarsNavItem(MARKETING_NAV_ITEMS, true).map((item) => item.key)).toEqual([
      "how",
      "regions",
      "cars",
      "fees",
      "faq",
      "about",
    ]);
  });

  it("appends when the nav has no Where we buy entry", () => {
    const items = MARKETING_NAV_ITEMS.filter((item) => item.key !== "regions");
    expect(withCarsNavItem(items, true).at(-1)).toBe(MARKETING_CARS_NAV_ITEM);
  });

  it("is idempotent", () => {
    const once = withCarsNavItem(MARKETING_NAV_ITEMS, true);
    expect(withCarsNavItem(once, true)).toBe(once);
  });

  it("points at the public /app/cars page", () => {
    expect(MARKETING_CARS_NAV_ITEM.href).toBe("/app/cars");
  });
});
