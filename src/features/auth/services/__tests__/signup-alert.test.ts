import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/staff-alerts/notify", () => ({ notifyStaff: vi.fn() }));

import { notifyStaff } from "@/features/staff-alerts/notify";
import { alertIfNewSignup, NEW_SIGNUP_WINDOW_MS } from "../signup-alert";

const NOW = Date.parse("2026-11-23T15:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("alertIfNewSignup", () => {
  it("tells staff about an account created moments ago, with how they signed up", () => {
    expect(alertIfNewSignup({ id: "u1", created_at: "2026-11-23T14:59:00Z", app_metadata: { provider: "google" } }, NOW)).toBe(true);
    expect(notifyStaff).toHaveBeenCalledWith({ kind: "new_signup", userId: "u1", method: "google" });
    alertIfNewSignup({ id: "u2", created_at: "2026-11-23T14:50:00Z", app_metadata: { provider: "email" } }, NOW);
    expect(notifyStaff).toHaveBeenLastCalledWith({ kind: "new_signup", userId: "u2", method: "email" });
  });

  it("stays quiet for a returning customer signing in again", () => {
    expect(alertIfNewSignup({ id: "u3", created_at: new Date(NOW - NEW_SIGNUP_WINDOW_MS - 1).toISOString() }, NOW)).toBe(false);
    expect(alertIfNewSignup(null, NOW)).toBe(false);
    expect(notifyStaff).not.toHaveBeenCalled();
  });
});
