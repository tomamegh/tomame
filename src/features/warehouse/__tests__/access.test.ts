import { describe, expect, it } from "vitest";

import { canAccessAdmin, canAccessWarehouse, isWarehouseOnly } from "@/lib/auth/admin-access";
import { postAuthDestination } from "@/lib/auth/post-auth-destination";

const as = (role: string | undefined) => ({ app_metadata: role ? { role } : {} });

describe("warehouse access (081)", () => {
  it("admits admins and warehouse operators, nobody else", () => {
    expect(canAccessWarehouse(as("admin"))).toBe(true);
    expect(canAccessWarehouse(as("warehouse"))).toBe(true);
    expect(canAccessWarehouse(as("user"))).toBe(false);
    expect(canAccessWarehouse(as("system"))).toBe(false);
    expect(canAccessWarehouse(as(undefined))).toBe(false);
    expect(canAccessWarehouse(null)).toBe(false);
  });

  it("never lets a warehouse operator through the admin gate", () => {
    expect(canAccessAdmin(as("warehouse"))).toBe(false);
    expect(isWarehouseOnly(as("warehouse"))).toBe(true);
    expect(isWarehouseOnly(as("admin"))).toBe(false);
  });

  it("sends an operator to the warehouse, and ignores a next outside it", () => {
    expect(postAuthDestination({ isAdmin: false, isWarehouse: true })).toBe("/warehouse");
    expect(postAuthDestination({ next: "/admin/users", isAdmin: false, isWarehouse: true })).toBe("/warehouse");
    expect(postAuthDestination({ next: "/app/bag", isAdmin: false, isWarehouse: true })).toBe("/warehouse");
    expect(postAuthDestination({ next: "/warehouse/p/PKG-10042", isAdmin: false, isWarehouse: true })).toBe(
      "/warehouse/p/PKG-10042",
    );
    expect(postAuthDestination({ next: "/warehousefoo", isAdmin: false, isWarehouse: true })).toBe("/warehouse");
  });

  it("leaves admins and customers as they were", () => {
    expect(postAuthDestination({ isAdmin: true })).toBe("/admin");
    expect(postAuthDestination({ isAdmin: false })).toBe("/app");
    expect(postAuthDestination({ next: "/warehouse", isAdmin: true })).toBe("/warehouse");
  });
});
