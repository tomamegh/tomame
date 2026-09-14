import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const from = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));

import {
  insertOrderFeedback,
  listOrderFeedback,
  transitionOrderFeedback,
} from "../order-feedback";

/**
 * A recording stub of the PostgREST builder. Every terminal call resolves to
 * `result`, and `calls` keeps what each link was given so the guard clauses can
 * be asserted rather than assumed.
 */
function builder(result: Record<string, unknown>) {
  const calls: { eq: unknown[][]; update?: unknown; insert?: unknown; select?: unknown[] } = {
    eq: [],
  };
  const chain: Record<string, unknown> = {
    insert: (...args: unknown[]) => ((calls.insert = args[0]), chain),
    update: (...args: unknown[]) => ((calls.update = args[0]), chain),
    select: (...args: unknown[]) => ((calls.select = args), chain),
    eq: (...args: unknown[]) => (calls.eq.push(args), chain),
    order: () => chain,
    limit: () => result,
    single: () => result,
    maybeSingle: () => result,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  from.mockReturnValue(chain);
  return calls;
}

beforeEach(() => vi.clearAllMocks());

describe("insertOrderFeedback", () => {
  it("writes the customer's words and nothing about status", async () => {
    const calls = builder({ data: { id: "fb-1" }, error: null });

    await insertOrderFeedback({
      orderId: "o1",
      photoId: null,
      userId: "u1",
      verdict: "looks_right",
      message: "Looks right to me.",
    });

    expect(from).toHaveBeenCalledWith("order_feedback");
    expect(calls.insert).toEqual({
      order_id: "o1",
      photo_id: null,
      user_id: "u1",
      verdict: "looks_right",
      message: "Looks right to me.",
    });
    // `status` and `handled_by` are staff facts and are never written here.
    expect(calls.insert).not.toHaveProperty("status");
    expect(calls.insert).not.toHaveProperty("handled_by");
  });

  it("throws rather than swallowing — the customer is told the truth", async () => {
    builder({ data: null, error: { message: "violates check constraint" } });

    await expect(
      insertOrderFeedback({
        orderId: "o1",
        photoId: null,
        userId: "u1",
        verdict: "other",
        message: "x",
      }),
    ).rejects.toThrow(/violates check constraint/);
  });
});

describe("listOrderFeedback", () => {
  it("filters by status when given one and returns [] for no rows", async () => {
    const calls = builder({ data: null, error: null });

    expect(await listOrderFeedback("open")).toEqual([]);
    expect(calls.eq).toContainEqual(["status", "open"]);
  });

  it("does not filter when no status is given", async () => {
    const calls = builder({ data: [], error: null });
    await listOrderFeedback();
    expect(calls.eq).toHaveLength(0);
  });
});

describe("transitionOrderFeedback", () => {
  it("guards the update on the status the admin saw", async () => {
    const calls = builder({ data: { id: "fb-1" }, error: null });

    await transitionOrderFeedback({
      id: "fb-1",
      from: "open",
      to: "in_review",
      handledBy: "admin-1",
    });

    // The `WHERE status = from` is the whole mechanism: without it two admins
    // both claim the same row and the second silently wins.
    expect(calls.eq).toContainEqual(["id", "fb-1"]);
    expect(calls.eq).toContainEqual(["status", "open"]);
    expect(calls.update).toMatchObject({ status: "in_review", handled_by: "admin-1" });
    expect(calls.update).not.toHaveProperty("resolved_at");
  });

  it("stamps resolved_at only when the row is being closed", async () => {
    const calls = builder({ data: { id: "fb-1" }, error: null });

    await transitionOrderFeedback({
      id: "fb-1",
      from: "in_review",
      to: "dismissed",
      handledBy: "admin-1",
      resolution: "Photo was of the right item",
    });

    expect(calls.update).toHaveProperty("resolved_at");
    expect(calls.update).toMatchObject({ resolution: "Photo was of the right item" });
  });

  it("returns null when the guard matched nothing — a lost race", async () => {
    builder({ data: null, error: null });

    expect(
      await transitionOrderFeedback({
        id: "fb-1",
        from: "open",
        to: "in_review",
        handledBy: "admin-2",
      }),
    ).toBeNull();
  });
});
