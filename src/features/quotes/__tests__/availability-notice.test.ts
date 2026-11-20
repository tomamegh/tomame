import { describe, expect, it } from "vitest";

import { availabilityNotice } from "../components/format";

describe("availabilityNotice", () => {
  it("reduces a store's phrase to one of three calm lines", () => {
    expect(availabilityNotice("In Stock.")).toEqual({ tone: "success", label: "In stock at the store" });
    expect(availabilityNotice("Only 2 left in stock - order soon.")).toEqual({ tone: "warning", label: "Only 2 left at the store" });
    expect(availabilityNotice("Currently unavailable. We don't know when or if this item will be back in stock.")).toEqual({
      tone: "warning",
      label: "Out of stock at the store",
    });
  });

  it("never prints scraped text it does not recognise", () => {
    expect(availabilityNotice("FREE delivery Tuesday, November 25 on orders shipped by Amazon")).toBeNull();
    expect(availabilityNotice("   ")).toBeNull();
    expect(availabilityNotice(null)).toBeNull();
  });
});
