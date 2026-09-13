import { describe, it, expect } from "vitest";

import {
  ADMIN_HOME,
  CUSTOMER_HOME,
  postAuthDestination,
  safeInternalPath,
} from "../post-auth-destination";

describe("postAuthDestination", () => {
  it("meets an admin with the admin view, not the storefront", () => {
    // The whole point: an admin used to be dropped on /app and had to know to
    // type /admin. They switch OUT to the customer view, not into the admin.
    expect(postAuthDestination({ isAdmin: true })).toBe(ADMIN_HOME);
  });

  it("sends a customer to the storefront", () => {
    expect(postAuthDestination({ isAdmin: false })).toBe(CUSTOMER_HOME);
  });

  it("honours an explicit destination for both roles", () => {
    // `?next=` is what the person was actually trying to reach when the proxy
    // interrupted them. Overriding it would lose a half-finished checkout.
    expect(postAuthDestination({ next: "/app/bag", isAdmin: true })).toBe("/app/bag");
    expect(postAuthDestination({ next: "/admin/orders", isAdmin: false })).toBe(
      "/admin/orders",
    );
  });

  it("falls back to the role's home when `next` is not a safe internal path", () => {
    for (const hostile of ["//evil.example", "https://evil.example", "/\\evil.example", "evil"]) {
      expect(postAuthDestination({ next: hostile, isAdmin: true })).toBe(ADMIN_HOME);
      expect(postAuthDestination({ next: hostile, isAdmin: false })).toBe(CUSTOMER_HOME);
    }
  });

  it("treats an empty `next` as absent", () => {
    expect(postAuthDestination({ next: "", isAdmin: false })).toBe(CUSTOMER_HOME);
    expect(postAuthDestination({ next: null, isAdmin: true })).toBe(ADMIN_HOME);
  });
});

describe("safeInternalPath", () => {
  it("accepts same-origin paths, including query and hash", () => {
    expect(safeInternalPath("/app/orders/new?url=x#top")).toBe("/app/orders/new?url=x#top");
  });

  it("refuses anything that could leave the site", () => {
    // A redirect straight off the site immediately after a successful sign-in
    // is when someone is most likely to retype a password into whatever loads.
    expect(safeInternalPath("//evil.example")).toBeNull();
    expect(safeInternalPath("/\\evil.example")).toBeNull();
    expect(safeInternalPath("https://evil.example")).toBeNull();
    expect(safeInternalPath("javascript:alert(1)")).toBeNull();
  });

  it("refuses absent values", () => {
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
    expect(safeInternalPath("")).toBeNull();
  });
});
