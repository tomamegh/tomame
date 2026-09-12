import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { consumeActiveLocks, consumeLock, findActiveLock, ratchetLockRate } from "../quote-locks";

/**
 * A PostgREST builder stand-in: every method records [name, args] and returns
 * the chain; awaiting the chain (or `maybeSingle`/`single`) yields `result`.
 */
function recordingClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: [string, unknown[]][] = [];
  const chain: Record<string, unknown> = {};
  for (const name of ["from", "select", "eq", "gt", "is", "or", "order", "limit", "update", "insert"]) {
    chain[name] = (...args: unknown[]) => (calls.push([name, args]), chain);
  }
  chain.maybeSingle = async () => result;
  chain.single = async () => result;
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  vi.mocked(createAdminClient).mockReturnValue(chain as never);
  return { calls, has: (name: string, args: unknown[]) => calls.some(([n, a]) => n === name && JSON.stringify(a) === JSON.stringify(args)) };
}

const CACHE_ID = "b4c99974-a1b4-4b49-ac8f-42dd0a0626d8";
const NOW = "2026-09-12T12:00:00.000Z";

const row = {
  id: "lock-1", user_id: null, session_id: "sess-1", extraction_cache_id: CACHE_ID, quantity: "1",
  exchange_rate: "14.49", mid_market_rate: "13.93", fx_rates: { USD: "13.93", gbp: 18.5 }, pricing: {},
  locked_at: NOW, expires_at: "2026-09-13T12:00:00.000Z", consumed_by_order_id: null, consumed_at: null, created_at: NOW,
};

beforeEach(() => vi.clearAllMocks());

describe("findActiveLock", () => {
  it("matches an anonymous viewer by session AND no owner, so an adopted lock is not reachable by the cookie alone", async () => {
    const c = recordingClient({ data: row, error: null });
    const lock = await findActiveLock({ userId: null, sessionId: "sess-1" }, CACHE_ID, NOW);
    expect(c.has("eq", ["session_id", "sess-1"])).toBe(true);
    expect(c.has("is", ["user_id", null])).toBe(true);
    expect(c.has("gt", ["expires_at", NOW])).toBe(true);
    expect(c.has("is", ["consumed_by_order_id", null])).toBe(true);
    expect(lock?.id).toBe("lock-1");
  });

  it("matches a signed-in viewer by user_id only", async () => {
    const c = recordingClient({ data: row, error: null });
    await findActiveLock({ userId: "user-1", sessionId: "sess-1" }, CACHE_ID, NOW);
    expect(c.has("eq", ["user_id", "user-1"])).toBe(true);
    expect(c.has("eq", ["session_id", "sess-1"])).toBe(false);
    expect(c.has("is", ["user_id", null])).toBe(false);
  });

  it("normalises NUMERIC strings and the fx_rates snapshot to numbers, keys upper-cased", async () => {
    recordingClient({ data: row, error: null });
    const lock = await findActiveLock({ userId: null, sessionId: "sess-1" }, CACHE_ID, NOW);
    expect(lock).toMatchObject({ exchange_rate: 14.49, mid_market_rate: 13.93, quantity: 1, fx_rates: { USD: 13.93, GBP: 18.5 } });
  });

  it("returns null without a query for a viewer with no identity", async () => {
    const c = recordingClient({ data: row, error: null });
    expect(await findActiveLock({ userId: null, sessionId: null }, CACHE_ID, NOW)).toBeNull();
    expect(c.calls.filter(([n]) => n === "eq")).toHaveLength(1); // only extraction_cache_id
  });
});

describe("ratchetLockRate", () => {
  const rates = { exchange_rate: 15.01, mid_market_rate: 14.43, fx_rates: { USD: 14.43 } };

  it("only touches a row whose rate is still ABOVE the new one, and writes the fx snapshot too", async () => {
    const c = recordingClient({ data: [{ id: "lock-1" }], error: null });
    expect(await ratchetLockRate("lock-1", rates)).toBe(true);
    expect(c.has("update", [{ exchange_rate: 15.01, mid_market_rate: 14.43, fx_rates: { USD: 14.43 } }])).toBe(true);
    expect(c.has("eq", ["id", "lock-1"])).toBe(true);
    expect(c.has("gt", ["exchange_rate", 15.01])).toBe(true);
  });

  it("reports no change when the guard matched no row (already ratcheted, or the new rate is not lower)", async () => {
    recordingClient({ data: [], error: null });
    expect(await ratchetLockRate("lock-1", rates)).toBe(false);
  });

  it("throws on a failed write", async () => {
    recordingClient({ data: null, error: { message: "boom" } });
    await expect(ratchetLockRate("lock-1", rates)).rejects.toThrow(/ratchet/);
  });
});

describe("consumeLock", () => {
  it("marks only a still-unconsumed lock and returns how many rows changed", async () => {
    const c = recordingClient({ data: [{ id: "lock-1" }], error: null });
    expect(await consumeLock("lock-1", "order-9", NOW)).toBe(1);
    expect(c.has("is", ["consumed_by_order_id", null])).toBe(true);
    expect(c.has("update", [{ consumed_by_order_id: "order-9", consumed_at: NOW }])).toBe(true);
  });

  it("returns 0 when another order got there first", async () => {
    recordingClient({ data: [], error: null });
    expect(await consumeLock("lock-1", "order-9", NOW)).toBe(0);
  });
});

describe("consumeActiveLocks", () => {
  it("marks every unexpired, unconsumed lock the viewer holds on the extraction — theirs or their cookie's", async () => {
    const c = recordingClient({ data: [{ id: "lock-1" }, { id: "lock-2" }], error: null });
    const ids = await consumeActiveLocks({ userId: "user-1", sessionId: "sess-1" }, CACHE_ID, "order-9", NOW);
    expect(ids).toEqual(["lock-1", "lock-2"]);
    expect(c.has("eq", ["extraction_cache_id", CACHE_ID])).toBe(true);
    expect(c.has("gt", ["expires_at", NOW])).toBe(true);
    expect(c.has("is", ["consumed_by_order_id", null])).toBe(true);
    expect(c.has("or", ["user_id.eq.user-1,and(session_id.eq.sess-1,user_id.is.null)"])).toBe(true);
    expect(c.has("update", [{ consumed_by_order_id: "order-9", consumed_at: NOW }])).toBe(true);
  });

  it("scopes an anonymous viewer to their session's unowned locks", async () => {
    const c = recordingClient({ data: [], error: null });
    await consumeActiveLocks({ userId: null, sessionId: "sess-1" }, CACHE_ID, "order-9", NOW);
    expect(c.has("or", ["and(session_id.eq.sess-1,user_id.is.null)"])).toBe(true);
  });

  it("does nothing for a viewer with no identity", async () => {
    const c = recordingClient({ data: [], error: null });
    expect(await consumeActiveLocks({ userId: null, sessionId: null }, CACHE_ID, "order-9", NOW)).toEqual([]);
    expect(c.calls).toHaveLength(0);
  });
});
