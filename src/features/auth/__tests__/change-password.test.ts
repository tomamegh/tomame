import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({
  logAuditEvent: vi.fn(async () => undefined),
}));

const signInWithPassword = vi.fn();
const updateUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signInWithPassword, updateUser } }) as never),
}));

import { changePassword } from "../services/auth.service";

beforeEach(() => {
  vi.clearAllMocks();
  signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  updateUser.mockResolvedValue({ error: null });
});

/**
 * The account screen's Security tab is the first customer-facing surface for
 * this endpoint, and it used to accept a new password on the strength of the
 * session cookie alone: the route collected `current_password`, checked it was
 * non-empty, and threw it away. Anyone with a borrowed session could lock the
 * owner out. These tests are what keeps that from coming back.
 */
describe("changePassword", () => {
  it("verifies the current password before setting a new one", async () => {
    await changePassword("kwame@tomame.local", "old-one", "new-one");

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "kwame@tomame.local",
      password: "old-one",
    });
    expect(updateUser).toHaveBeenCalledWith({ password: "new-one" });

    // Order matters: the check has to happen first, or it is decoration.
    const verifiedAt = signInWithPassword.mock.invocationCallOrder[0] ?? Infinity;
    const changedAt = updateUser.mock.invocationCallOrder[0] ?? -Infinity;
    expect(verifiedAt).toBeLessThan(changedAt);
  });

  it("refuses with 401 and changes nothing when the current password is wrong", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });

    await expect(changePassword("kwame@tomame.local", "guess", "new-one")).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("refuses when Supabase returns no user even without an error", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: null });

    await expect(changePassword("kwame@tomame.local", "guess", "new-one")).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("surfaces a failed update as 400, distinct from a failed check", async () => {
    updateUser.mockResolvedValue({ error: { message: "weak password" } });

    await expect(changePassword("kwame@tomame.local", "old-one", "x")).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
