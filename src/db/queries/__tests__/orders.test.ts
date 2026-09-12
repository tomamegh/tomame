import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MOVING_ORDER_STATUSES,
  countMovingOrders,
  getRecentOrdersForUser,
} from "../orders";

function clientReturning(result: Record<string, unknown>) {
  const calls: Record<string, unknown[]> = {};
  const chain: Record<string, unknown> = {
    select: (...args: unknown[]) => ((calls.select = args), chain),
    eq: (...args: unknown[]) => ((calls.eq = args), chain),
    in: (...args: unknown[]) => ((calls.in = args), chain),
    order: (...args: unknown[]) => ((calls.order = args), chain),
    limit: (...args: unknown[]) => ((calls.limit = args), result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  const client = { from: (...args: unknown[]) => ((calls.from = args), chain) };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("getRecentOrdersForUser", () => {
  it("selects only the columns the Home list renders, newest first, capped", async () => {
    const rows = [{ id: "order-1" }];
    const { client, calls } = clientReturning({ data: rows, error: null });

    expect(await getRecentOrdersForUser(client, "user-1", 4)).toEqual(rows);
    expect(calls.from).toEqual(["orders"]);
    expect(calls.select?.[0]).toBe(
      "id, product_name, product_url, status, pricing, estimated_delivery_date, created_at",
    );
    expect(calls.select?.[0]).not.toBe("*");
    expect(calls.eq).toEqual(["user_id", "user-1"]);
    expect(calls.order).toEqual(["created_at", { ascending: false }]);
    expect(calls.limit).toEqual([4]);
  });

  it("returns an empty array when there are no orders", async () => {
    const { client } = clientReturning({ data: null, error: null });
    expect(await getRecentOrdersForUser(client, "user-1", 4)).toEqual([]);
  });

  it("throws with the database message attached", async () => {
    const { client } = clientReturning({
      data: null,
      error: { code: "42P01", message: 'relation "orders" does not exist' },
    });
    await expect(getRecentOrdersForUser(client, "user-1", 4)).rejects.toThrow(
      /relation "orders" does not exist/,
    );
  });
});

describe("countMovingOrders", () => {
  it("counts in the database rather than fetching rows", async () => {
    const { client, calls } = clientReturning({ count: 2, error: null });

    expect(await countMovingOrders(client, "user-1")).toBe(2);
    expect(calls.select?.[1]).toEqual({ head: true, count: "exact" });
    expect(calls.in).toEqual(["status", ["paid", "processing", "in_transit"]]);
  });

  it("treats a null count as zero", async () => {
    const { client } = clientReturning({ count: null, error: null });
    expect(await countMovingOrders(client, "user-1")).toBe(0);
  });

  it("throws with the database message attached", async () => {
    const { client } = clientReturning({
      count: null,
      error: { code: "PGRST205", message: "Could not find the table" },
    });
    await expect(countMovingOrders(client, "user-1")).rejects.toThrow(
      /Could not find the table/,
    );
  });

  it("keeps the moving statuses in step with the state machine", () => {
    expect([...MOVING_ORDER_STATUSES]).toEqual([
      "paid",
      "processing",
      "in_transit",
    ]);
  });
});
