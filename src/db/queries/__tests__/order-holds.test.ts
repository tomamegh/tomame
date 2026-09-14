import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const from = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));

import { clearOrderHold, setOrderHold } from "../order-holds";

function builder(result: Record<string, unknown>) {
  const calls: {
    eq: unknown[][];
    is: unknown[][];
    not: unknown[][];
    update?: Record<string, unknown>;
  } = { eq: [], is: [], not: [] };
  const chain: Record<string, unknown> = {
    update: (...args: unknown[]) => ((calls.update = args[0] as Record<string, unknown>), chain),
    select: () => chain,
    eq: (...args: unknown[]) => (calls.eq.push(args), chain),
    is: (...args: unknown[]) => (calls.is.push(args), chain),
    not: (...args: unknown[]) => (calls.not.push(args), chain),
    maybeSingle: () => result,
  };
  from.mockReturnValue(chain);
  return calls;
}

beforeEach(() => vi.clearAllMocks());

describe("setOrderHold", () => {
  it("writes all three hold columns, guarded on not already being held", async () => {
    const calls = builder({ data: { id: "o1" }, error: null });

    await setOrderHold({ orderId: "o1", reason: "Wrong colour", heldBy: "admin-1" });

    expect(from).toHaveBeenCalledWith("orders");
    expect(calls.eq).toContainEqual(["id", "o1"]);
    expect(calls.is).toContainEqual(["held_at", null]);
    expect(calls.update).toMatchObject({ hold_reason: "Wrong colour", held_by: "admin-1" });
    expect(calls.update?.held_at).toEqual(expect.any(String));
    // A hold is not a status: nothing here touches `status`.
    expect(calls.update).not.toHaveProperty("status");
  });

  it("returns null when the order was already held", async () => {
    builder({ data: null, error: null });
    expect(await setOrderHold({ orderId: "o1", reason: "r", heldBy: "a" })).toBeNull();
  });
});

describe("clearOrderHold", () => {
  it("clears all three columns together, guarded on being held", async () => {
    const calls = builder({ data: { id: "o1" }, error: null });

    await clearOrderHold("o1");

    // Leaving `hold_reason` behind would have the next reader believe a released
    // parcel is still stopped.
    expect(calls.update).toMatchObject({ held_at: null, hold_reason: null, held_by: null });
    expect(calls.not).toContainEqual(["held_at", "is", null]);
  });

  it("throws with the database message attached", async () => {
    builder({ data: null, error: { message: "permission denied for table orders" } });
    await expect(clearOrderHold("o1")).rejects.toThrow(/permission denied/);
  });
});
