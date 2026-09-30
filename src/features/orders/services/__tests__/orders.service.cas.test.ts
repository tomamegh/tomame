import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { app: { url: "http://localhost:3000" } } }));
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email/notify-preference", () => ({ mayEmailUser: vi.fn(async () => true) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("../order-intake.service", () => ({ buildOrderIntake: vi.fn() }));
vi.mock("../order-events.service", () => ({ eventForStatus: vi.fn(() => null), recordOrderEvent: vi.fn() }));
vi.mock("@/features/quotes/services/quote-lock.service", () => ({ consumeQuoteLocksForOrder: vi.fn() }));

import { getOrderById, updateOrderStatus } from "../orders.service";

type Result = { data: unknown; error: { code: string; message: string } | null };

/** A query chain that records every `.eq` and answers `maybeSingle` with `result`. */
function fakeClient(result: Result) {
  const eqs: Array<[string, unknown]> = [];
  const chain = {
    select: () => chain,
    update: () => chain,
    eq: (column: string, value: unknown) => {
      eqs.push([column, value]);
      return chain;
    },
    maybeSingle: async () => result,
  };
  const client = { from: () => chain } as unknown as SupabaseClient;
  return { client, eqs };
}

beforeEach(() => vi.clearAllMocks());

describe("getOrderById", () => {
  it("answers null when no order has that id", async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect(await getOrderById(client, "o1")).toBeNull();
  });

  it("throws a 500 on a database error rather than calling it not found", async () => {
    const { client } = fakeClient({ data: null, error: { code: "57P01", message: "connection lost" } });
    await expect(getOrderById(client, "o1")).rejects.toMatchObject({ statusCode: 500 });
  });

  it("treats a malformed id as not found", async () => {
    const { client } = fakeClient({ data: null, error: { code: "22P02", message: "invalid input syntax for type uuid" } });
    expect(await getOrderById(client, "not-a-uuid")).toBeNull();
  });
});

describe("updateOrderStatus is compare-and-set", () => {
  it("guards the write on the status the transition was validated against", async () => {
    const { client, eqs } = fakeClient({ data: { id: "o1", status: "in_transit" }, error: null });
    const updated = await updateOrderStatus(client, "o1", "processing", { status: "in_transit" });
    expect(updated).toMatchObject({ status: "in_transit" });
    expect(eqs).toEqual([
      ["id", "o1"],
      ["status", "processing"],
    ]);
  });

  it("answers 409 when the order already moved (0 rows matched)", async () => {
    const { client } = fakeClient({ data: null, error: null });
    await expect(updateOrderStatus(client, "o1", "processing", { status: "in_transit" })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("answers 500 on a database error", async () => {
    const { client } = fakeClient({ data: null, error: { code: "57P01", message: "connection lost" } });
    await expect(updateOrderStatus(client, "o1", "processing", { status: "in_transit" })).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
