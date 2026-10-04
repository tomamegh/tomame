import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Result = { data: unknown; error: { message: string } | null };
const results: Record<string, Result> = {};
const selects: Record<string, string> = {};
const from = vi.fn((table: string) => {
  const chain = {
    select: (columns: string) => ((selects[table] = columns), chain),
    eq: () => chain,
    maybeSingle: async () => results[table] ?? { data: null, error: null },
  };
  return chain;
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));

import { getOrderPhones } from "../public-tracking";

const ORDER = { user_id: "u-1", order_group_id: "g-1", delivery_address_id: null };

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(results)) delete results[key];
});

describe("getOrderPhones", () => {
  it("finds the phone on the saved address a pickup bag used, when the snapshot and profile have none", async () => {
    results.order_groups = { data: { phone: null, address: { phone: "024 555 0192" } }, error: null };
    results.profiles = { data: { phone: null }, error: null };
    expect(await getOrderPhones(ORDER)).toEqual(["024 555 0192"]);
    expect(selects.order_groups).toContain("delivery_addresses(phone)");
  });

  it("reads the order's own saved address too", async () => {
    results.delivery_addresses = { data: { phone: "+233 20 111 2222" }, error: null };
    expect(await getOrderPhones({ ...ORDER, order_group_id: null, delivery_address_id: "a-1" })).toEqual([
      "+233 20 111 2222",
    ]);
  });

  it("is empty when no phone is on file anywhere", async () => {
    results.order_groups = { data: { phone: "", address: null }, error: null };
    expect(await getOrderPhones(ORDER)).toEqual([]);
  });

  it("throws on a failed read instead of answering 'no phones'", async () => {
    results.profiles = { data: null, error: { message: "boom" } };
    await expect(getOrderPhones(ORDER)).rejects.toThrow(/boom/);
  });
});
