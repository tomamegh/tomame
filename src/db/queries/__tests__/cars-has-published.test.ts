import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const from = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));

import { hasPublishedCarListing } from "../cars";

const calls: { method: string; args: unknown[] }[] = [];

function respond(result: { data: unknown[] | null; error: { message: string } | null }) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.limit = (...args: unknown[]) => {
    calls.push({ method: "limit", args });
    return Promise.resolve(result);
  };
  from.mockReturnValue(chain);
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
});

describe("hasPublishedCarListing", () => {
  it("asks for one published id and nothing more", async () => {
    respond({ data: [{ id: "car-1" }], error: null });

    await expect(hasPublishedCarListing()).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith("car_listings");
    // The service-role client bypasses RLS, so the published filter has to be
    // in the query itself — a draft must never count.
    expect(calls).toEqual([
      { method: "select", args: ["id"] },
      { method: "eq", args: ["is_published", true] },
      { method: "limit", args: [1] },
    ]);
  });

  it("is false when nothing is published", async () => {
    respond({ data: [], error: null });
    await expect(hasPublishedCarListing()).resolves.toBe(false);
  });

  it("is false for a null body", async () => {
    respond({ data: null, error: null });
    await expect(hasPublishedCarListing()).resolves.toBe(false);
  });

  it("throws on a database error rather than guessing", async () => {
    respond({ data: null, error: { message: "boom" } });
    await expect(hasPublishedCarListing()).rejects.toThrow(/published cars: boom/);
  });
});
