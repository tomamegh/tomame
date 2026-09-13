import { describe, it, expect } from "vitest";
import { canAccessAdmin } from "../admin-access";

describe("canAccessAdmin", () => {
  it("admits an admin whatever their email domain is", () => {
    // Every admin in this database is on @tomame.local or gmail. The old rule
    // ALSO demanded an @tomame.ca address, so it answered false for all of them
    // and hid the Admin link from every real administrator.
    for (const email of ["kelanimdev@gmail.com", "builder-test@tomame.local", "someone@tomame.ca"]) {
      expect(canAccessAdmin({ app_metadata: { role: "admin" }, email } as never)).toBe(true);
    }
  });

  it("refuses a tomame.ca address that carries no admin role", () => {
    // The proxy used to admit this: role OR domain. The role column is what
    // decides, and a mailbox is not a role.
    expect(canAccessAdmin({ app_metadata: { role: "user" }, email: "intern@tomame.ca" } as never)).toBe(false);
    expect(canAccessAdmin({ app_metadata: {}, email: "intern@tomame.ca" } as never)).toBe(false);
  });

  it("refuses anyone with no role at all", () => {
    expect(canAccessAdmin(null)).toBe(false);
    expect(canAccessAdmin(undefined)).toBe(false);
    expect(canAccessAdmin({})).toBe(false);
    expect(canAccessAdmin({ app_metadata: null })).toBe(false);
    expect(canAccessAdmin({ app_metadata: { role: "customer" } })).toBe(false);
  });
});
