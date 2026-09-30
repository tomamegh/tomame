import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/db/queries/auth-sessions", () => ({ revokeUserSessions: vi.fn(async () => 1) }));

import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { revokeUserSessions } from "@/db/queries/auth-sessions";
import {
  adminResetUserPassword,
  createUser,
  isUserDeactivated,
  setUserActive,
} from "@/features/users/services/users.service";
import type { PlatformUser } from "@/features/users/types";

const admin = { id: "admin-1", email: "admin@tomame.test", profile: { role: "admin" } } as unknown as PlatformUser;
const future = new Date(Date.now() + 86_400_000).toISOString();

/**
 * A fake admin client holding one auth user. `profiles` answers selects on
 * `id` only — asking it for anything else fails the way Postgres does, which
 * is how the old by-email lookup broke every reset.
 */
function fakeClient(authUser: { id: string; email?: string; banned_until?: string | null; created_at: string }) {
  const user = { ...authUser };
  const client = {
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) =>
          id === user.id ? { data: { user: { ...user } }, error: null } : { data: { user: null }, error: { message: "not found" } },
        ),
        updateUserById: vi.fn(async (_id: string, attrs: { ban_duration?: string }) => {
          user.banned_until = attrs.ban_duration === "none" ? null : future;
          return { data: { user }, error: null };
        }),
        createUser: vi.fn(async () => ({
          data: { user: null },
          error: { code: "email_exists", status: 422, message: "A user with this email address has already been registered" },
        })),
      },
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    },
    from: vi.fn(() => {
      let column = "";
      const q = {
        select: () => q,
        eq: (col: string) => ((column = col), q),
        single: async () =>
          column === "id"
            ? { data: { id: user.id, role: "user", created_at: user.created_at }, error: null }
            : { data: null, error: { code: "42703", message: `column profiles.${column} does not exist` } },
      };
      return q;
    }),
  };
  vi.mocked(createAdminClient).mockReturnValue(client as never);
  return client;
}

describe("adminResetUserPassword", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emails the user the route resolved, without a second lookup by email", async () => {
    const client = fakeClient({ id: "u-1", email: "benjamin@example.com", created_at: "2026-09-11T00:00:00Z" });
    const target = { id: "u-1", email: "benjamin@example.com", profile: { role: "user" } } as unknown as PlatformUser;

    await expect(adminResetUserPassword(admin, target)).resolves.toEqual({ message: "Password reset email sent" });
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith("benjamin@example.com", expect.any(Object));
    expect(client.from).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "admin_password_reset_initiated", entityId: "u-1" }));
  });

  it("refuses an account with no email address", async () => {
    fakeClient({ id: "u-1", created_at: "2026-09-11T00:00:00Z" });
    const target = { id: "u-1", email: undefined, profile: { role: "user" } } as unknown as PlatformUser;
    await expect(adminResetUserPassword(admin, target)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("createUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports a taken email as 409 from the auth error", async () => {
    fakeClient({ id: "u-1", created_at: "2026-09-11T00:00:00Z" });
    await expect(createUser(admin, "taken@example.com", "pw-123456", "user", "A", "B")).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe("setUserActive", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deactivates with a ban and audits it", async () => {
    const client = fakeClient({ id: "u-1", email: "b@example.com", created_at: "2026-09-11T00:00:00Z" });
    const updated = await setUserActive(admin, "u-1", false);

    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith("u-1", { ban_duration: "876000h" });
    expect(isUserDeactivated(updated)).toBe(true);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "user_deactivated", entityId: "u-1" }));
    // Their open sessions end too, not just future sign-ins.
    expect(revokeUserSessions).toHaveBeenCalledWith("u-1");
  });

  it("still deactivates when ending the sessions fails (the ban holds at the next refresh)", async () => {
    fakeClient({ id: "u-1", email: "b@example.com", created_at: "2026-09-11T00:00:00Z" });
    vi.mocked(revokeUserSessions).mockRejectedValueOnce(new Error("rpc failed"));
    const updated = await setUserActive(admin, "u-1", false);
    expect(isUserDeactivated(updated)).toBe(true);
  });

  it("reactivates by lifting the ban", async () => {
    const client = fakeClient({ id: "u-1", email: "b@example.com", banned_until: future, created_at: "2026-09-11T00:00:00Z" });
    const updated = await setUserActive(admin, "u-1", true);

    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith("u-1", { ban_duration: "none" });
    expect(isUserDeactivated(updated)).toBe(false);
    expect(revokeUserSessions).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "user_reactivated" }));
  });

  it("is idempotent: the state it is already in writes nothing", async () => {
    const client = fakeClient({ id: "u-1", email: "b@example.com", banned_until: future, created_at: "2026-09-11T00:00:00Z" });
    await setUserActive(admin, "u-1", false);

    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("refuses the admin's own account", async () => {
    fakeClient({ id: "admin-1", created_at: "2026-09-11T00:00:00Z" });
    await expect(setUserActive(admin, "admin-1", false)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses a system account", async () => {
    const client = fakeClient({ id: "sys-1", created_at: "2026-09-11T00:00:00Z" });
    client.from.mockImplementation(() => {
      const q = { select: () => q, eq: () => q, single: async () => ({ data: { id: "sys-1", role: "system", created_at: "2026-09-11T00:00:00Z" }, error: null }) };
      return q;
    });
    await expect(setUserActive(admin, "sys-1", false)).rejects.toMatchObject({ statusCode: 400 });
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("404s an unknown user", async () => {
    fakeClient({ id: "u-1", created_at: "2026-09-11T00:00:00Z" });
    await expect(setUserActive(admin, "nobody", false)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("treats an expired ban as active", () => {
    expect(isUserDeactivated({ banned_until: "2000-01-01T00:00:00Z" })).toBe(false);
    expect(isUserDeactivated({ banned_until: undefined })).toBe(false);
  });
});
