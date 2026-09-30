import { describe, expect, it } from "vitest";

import { APP_CARS_NAV_ITEM, APP_NAV_ITEMS, appNavItems, resolveActiveAppNavKey } from "../links";

describe("appNavItems — the Cars tab", () => {
  it("is absent while nothing is published", () => {
    expect(appNavItems(false)).toBe(APP_NAV_ITEMS);
    expect(appNavItems(false).map((item) => item.key)).not.toContain("cars");
  });

  it("joins the end of the bar once a listing is published", () => {
    const keys = appNavItems(true).map((item) => item.key);
    expect(keys).toEqual(["home", "shop", "ship", "orders", "cars"]);
  });

  it("links to the public forecourt", () => {
    expect(APP_CARS_NAV_ITEM.href).toBe("/app/cars");
    expect(APP_CARS_NAV_ITEM.mobileLabel).toBe("Cars");
  });

  it("never adds a second Cars tab", () => {
    const once = appNavItems(true);
    expect(appNavItems(true, once)).toBe(once);
  });

  it("lights up on the index and on one car", () => {
    const items = appNavItems(true);
    expect(resolveActiveAppNavKey("/app/cars", items)).toBe("cars");
    expect(resolveActiveAppNavKey("/app/cars/2019-toyota-rav4", items)).toBe("cars");
    // Home stays exact, so the forecourt does not also light it.
    expect(resolveActiveAppNavKey("/app", items)).toBe("home");
  });
});
