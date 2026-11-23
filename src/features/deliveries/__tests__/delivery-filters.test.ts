import { describe, expect, it } from "vitest";

import { DELIVERY_FILTERS, DELIVERY_FILTER_ORDER, deliveryFilterCount, deliveryFilterOf, reconcileShipments } from "../delivery-filters";
import { orderPeople } from "@/features/orders/order-people";

const counts = { processing: 3, in_transit: 2, delivered: 1, completed: 23 };

describe("delivery filters (Fix 15)", () => {
  it("has one Delivered chip whose count equals the Delivered tile, and Moving counts nothing delivered", () => {
    const labels = DELIVERY_FILTER_ORDER.map((k) => DELIVERY_FILTERS[k].label);
    expect(labels.filter((l) => l === "Delivered")).toHaveLength(1);
    expect(deliveryFilterCount("delivered", counts)).toBe(24);
    expect(deliveryFilterCount("moving", counts)).toBe(5);
    expect(deliveryFilterCount("all", counts)).toBe(29);
  });

  it("defaults to Moving and ignores unknown filters", () => {
    expect(deliveryFilterOf(undefined)).toBe("moving");
    expect(deliveryFilterOf("completed")).toBe("moving");
    expect(deliveryFilterOf("delivered")).toBe("delivered");
  });
});

describe("orderPeople (Fix 15)", () => {
  it("names the recipient everywhere, with the account holder beside when different", () => {
    expect(orderPeople({ recipient_name: "Benita Lamptey" }, { first_name: "Mac-Dennis", last_name: "Lamptey" })).toEqual({
      name: "Benita Lamptey",
      account: "Mac-Dennis Lamptey",
      missing: false,
    });
    expect(orderPeople(null, { first_name: "Ama", last_name: "Owusu" })).toEqual({ name: "Ama Owusu", account: null, missing: false });
    expect(orderPeople({ recipient_name: " " }, { first_name: null, last_name: null })).toEqual({ name: null, account: null, missing: true });
  });
});

describe("reconcileShipments (Fix 15)", () => {
  it("says why 19 packages shipped and 24 orders delivered differ", () => {
    const r = reconcileShipments({
      packages_shipped: 19,
      in_shipped_packages: { in_transit: 1, delivered: 20, other: 0 },
      delivered: { in_shipped_package: 20, in_unshipped_package: 0, no_package: 4 },
    });
    expect(r.agree).toBe(false);
    expect(r.lines[0]).toBe("19 packages shipped, holding 21 orders: 20 delivered, 1 still in the air.");
    expect(r.lines[1]).toBe("24 orders delivered: 20 went in a shipped package, 4 left without one (shipped before packages existed, or moved on from the admin console).");
  });

  it("agrees when every delivered order went in a shipped package, and names records to fix", () => {
    expect(reconcileShipments({ packages_shipped: 2, in_shipped_packages: { in_transit: 0, delivered: 3, other: 0 }, delivered: { in_shipped_package: 3, in_unshipped_package: 0, no_package: 0 } }).agree).toBe(true);
    const fix = reconcileShipments({ packages_shipped: 1, in_shipped_packages: { in_transit: 0, delivered: 1, other: 0 }, delivered: { in_shipped_package: 1, in_unshipped_package: 2, no_package: 0 } });
    expect(fix.lines[1]).toMatch(/2 sit in a package never marked shipped \(a record to fix\)/);
    const none = reconcileShipments({ packages_shipped: 0, in_shipped_packages: { in_transit: 0, delivered: 0, other: 0 }, delivered: { in_shipped_package: 0, in_unshipped_package: 0, no_package: 0 } });
    expect(none.lines).toEqual(["Nothing has shipped or been delivered yet."]);
  });
});
