import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const maybeSingle = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

import { mayEmailUser } from "../notify-preference";

beforeEach(() => vi.clearAllMocks());

describe("mayEmailUser", () => {
  it("suppresses only when the customer explicitly turned email off", async () => {
    maybeSingle.mockResolvedValue({ data: { notify_email: false }, error: null });
    expect(await mayEmailUser("u1")).toBe(false);
  });

  it("sends when the preference is on", async () => {
    maybeSingle.mockResolvedValue({ data: { notify_email: true }, error: null });
    expect(await mayEmailUser("u1")).toBe(true);
  });

  it("sends when there is no account to have a preference", async () => {
    // A contact reply to a signed-out visitor: the sender chose to write to them.
    expect(await mayEmailUser(null)).toBe(true);
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("fails OPEN when the row cannot be read", async () => {
    // These are receipts and parcel updates. A database blip must not silently
    // swallow them -- a message the customer never gets is the worse outcome.
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await mayEmailUser("u1")).toBe(true);

    maybeSingle.mockRejectedValue(new Error("connection reset"));
    expect(await mayEmailUser("u1")).toBe(true);
  });

  it("sends when the profile row is missing entirely", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await mayEmailUser("u1")).toBe(true);
  });
});
