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

describe("the shape the role actually arrives in", () => {
  /**
   * The bug this pins, found on hosted dev 2026-09-14: an administrator signing
   * in with Google was landed on `/app`.
   *
   * `custom_access_token_hook` injects `app_metadata.role` into the JWT CLAIMS
   * as the token is minted. It never writes `auth.users.raw_app_meta_data`, and
   * `session.user` is built from that row — so on a hosted project
   * `session.user.app_metadata.role` is undefined for EVERY account, admins
   * included. The OAuth callback tested exactly that value, so the condition was
   * always false.
   *
   * It hid locally because the hook is commented out in `supabase/config.toml`
   * and the local admin has the role set directly on `raw_app_meta_data`, where
   * `session.user` does see it. The workaround and the real mechanism populate
   * different places.
   */
  it("says yes for decoded token claims — what getClaims() returns", () => {
    expect(canAccessAdmin({ app_metadata: { role: "admin", provider: "google" } })).toBe(true);
  });

  it("says no for a hosted user object, which is why the callback must not use one", () => {
    // A real hosted admin: the profiles row says admin, the token says admin,
    // and the user object carries neither.
    const sessionUser = { app_metadata: { provider: "google", providers: ["google"] } };
    expect(canAccessAdmin(sessionUser)).toBe(false);
  });
});
