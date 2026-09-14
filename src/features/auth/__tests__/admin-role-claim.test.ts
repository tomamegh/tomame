import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({
  logAuditEvent: vi.fn(async () => undefined),
}));

const getUser = vi.fn();
const getClaims = vi.fn();
const single = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(
    async () =>
      ({
        auth: { getUser, getClaims },
        from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
      }) as never,
  ),
}));

import { getAuthenticatedUser, getUserSession } from "../services/auth.service";
import { requireAdmin } from "@/lib/auth/guards";
import { canAccessAdmin } from "@/lib/auth/admin-access";

/**
 * The shape a real hosted admin arrives in: the `profiles` row says admin, the
 * access token says admin, and the user object `getUser()` returns carries no
 * role at all. `custom_access_token_hook` writes the claim, never the row the
 * user object is built from.
 */
const hostedAdminUser = {
  id: "admin-1",
  email: "kelanimdev@gmail.com",
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
};

const adminProfile = {
  id: "admin-1",
  role: "admin",
  first_name: "Kelvin",
  last_name: null,
  bio: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const claimsWithRole = { sub: "admin-1", app_metadata: { role: "admin", provider: "google" } };
const claimsWithoutRole = { sub: "admin-1", app_metadata: { provider: "google" } };

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: hostedAdminUser }, error: null });
  single.mockResolvedValue({ data: adminProfile, error: null });
});

/**
 * Found live on hosted dev and prod, 2026-09-14: "Mark as purchasing" answered
 * "Admin access required" to the owner's own account. The route's `requireAdmin`
 * read `profile.role` and let the admin through; the service's `canAccessAdmin`
 * read `app_metadata.role` off a `getUser()` object that never carries it on
 * hosted Supabase, and refused them one call later. Locally the hook is off
 * and the admin has the role on `raw_app_meta_data`, which masked all of it.
 */
describe("getAuthenticatedUser carries the token's role onto the user", () => {
  it("admits a hosted admin whose getUser() metadata lacks the role, because the claims carry it", async () => {
    getClaims.mockResolvedValue({ data: { claims: claimsWithRole }, error: null });

    const user = await getAuthenticatedUser();
    expect(user).not.toBeNull();

    expect(canAccessAdmin(user)).toBe(true);
    expect(requireAdmin(user!)).toBe(user);
    // The DB profile is still loaded and still says what it said.
    expect(user!.profile.role).toBe("admin");
    expect(user!.profile.first_name).toBe("Kelvin");
  });

  it("refuses when neither the claims nor the user object carries the role, whatever the profile says", async () => {
    getClaims.mockResolvedValue({ data: { claims: claimsWithoutRole }, error: null });

    const user = await getAuthenticatedUser();
    expect(user).not.toBeNull();
    expect(user!.profile.role).toBe("admin");

    expect(canAccessAdmin(user)).toBe(false);
    expect(() => requireAdmin(user!)).toThrow(
      expect.objectContaining({ statusCode: 403, message: "Admin access required" }),
    );
  });

  it("keeps the role a local admin has on raw_app_meta_data when the claims are silent about it", async () => {
    // The local stack: hook commented out, role set by hand on the auth row.
    getUser.mockResolvedValue({
      data: { user: { ...hostedAdminUser, app_metadata: { provider: "email", role: "admin" } } },
      error: null,
    });
    getClaims.mockResolvedValue({ data: { claims: claimsWithoutRole }, error: null });

    const user = await getAuthenticatedUser();
    expect(canAccessAdmin(user)).toBe(true);
  });

  it("still answers no for a customer whose token says user", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "u1", app_metadata: { role: "user" } } },
      error: null,
    });
    single.mockResolvedValue({ data: { ...adminProfile, role: "user" }, error: null });

    const user = await getAuthenticatedUser();
    expect(canAccessAdmin(user)).toBe(false);
    expect(() => requireAdmin(user!)).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it("returns null when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    getClaims.mockResolvedValue({ data: null, error: null });

    expect(await getAuthenticatedUser()).toBeNull();
  });
});

describe("getUserSession builds the same user", () => {
  it("its user and its session agree about who is an admin", async () => {
    getClaims.mockResolvedValue({ data: { claims: claimsWithRole }, error: null });

    const { user, session } = await getUserSession();
    expect(canAccessAdmin(session)).toBe(true);
    expect(canAccessAdmin(user)).toBe(true);
    expect(requireAdmin(user)).toBe(user);
  });

  it("refuses through requireAdmin when the token has no role", async () => {
    getClaims.mockResolvedValue({ data: { claims: claimsWithoutRole }, error: null });

    const { user, session } = await getUserSession();
    expect(canAccessAdmin(session)).toBe(false);
    expect(() => requireAdmin(user)).toThrow(expect.objectContaining({ statusCode: 403 }));
  });
});
