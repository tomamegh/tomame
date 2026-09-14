import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ kind: "admin" }) }));
vi.mock("@/db/queries/orders", () => ({ getOrderOwner: vi.fn() }));
vi.mock("@/db/queries/order-events", () => ({
  listOrderEvents: vi.fn(),
  listOrderEventsForOrders: vi.fn(),
  insertOrderEvent: vi.fn(),
}));

import { getOrderOwner } from "@/db/queries/orders";
import * as q from "@/db/queries/order-events";
import { APIError } from "@/lib/auth/api-helpers";
import type { PlatformUser } from "@/features/users/types";
import {
  eventForStatus,
  listCustomerOrderEvents,
  mapCustomerOrderEvents,
  recordOrderEvent,
} from "../order-events.service";

const customer = { id: "u1", profile: { role: "user" } } as unknown as PlatformUser;
const otherCustomer = { id: "u2", profile: { role: "user" } } as unknown as PlatformUser;
// The admin decision is `canAccessAdmin`, which reads the token's
// `app_metadata.role` (what `getAuthenticatedUser` now carries onto the user),
// not the `profiles` column.
const admin = {
  id: "a1",
  app_metadata: { role: "admin" },
  profile: { role: "admin" },
} as unknown as PlatformUser;

const row = (over: Partial<q.OrderEventRow> = {}): q.OrderEventRow => ({
  id: "e1",
  order_id: "o1",
  order_group_id: null,
  kind: "purchased",
  title: "Our buyer is placing the order",
  detail: null,
  location: null,
  weight_lbs: null,
  occurred_at: "2026-09-02T09:41:00Z",
  is_customer_visible: true,
  created_by: null,
  created_at: "2026-09-02T09:41:00Z",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(q.listOrderEvents).mockResolvedValue([row()]);
});

describe("listCustomerOrderEvents — owner scoping", () => {
  it("returns the owner's own events, customer-visible only", async () => {
    vi.mocked(getOrderOwner).mockResolvedValue({ id: "o1", user_id: "u1" });

    await expect(listCustomerOrderEvents(customer, "o1")).resolves.toEqual([row()]);
    expect(q.listOrderEvents).toHaveBeenCalledWith(expect.anything(), "o1", {
      customerVisibleOnly: true,
    });
  });

  it("404s somebody else's order — and never reads its events", async () => {
    vi.mocked(getOrderOwner).mockResolvedValue({ id: "o1", user_id: "u1" });

    await expect(listCustomerOrderEvents(otherCustomer, "o1")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(q.listOrderEvents).not.toHaveBeenCalled();
  });

  it("404s an order that does not exist, with the same message — the ids cannot be probed", async () => {
    vi.mocked(getOrderOwner).mockResolvedValue(null);

    const missing = await listCustomerOrderEvents(customer, "nope").catch((e: APIError) => e);
    const foreign = await (async () => {
      vi.mocked(getOrderOwner).mockResolvedValue({ id: "o1", user_id: "u1" });
      return listCustomerOrderEvents(otherCustomer, "o1").catch((e: APIError) => e);
    })();

    expect((missing as APIError).message).toBe((foreign as APIError).message);
  });

  it("lets an admin read any order's events, still without the internal ones", async () => {
    vi.mocked(getOrderOwner).mockResolvedValue({ id: "o1", user_id: "u1" });

    await expect(listCustomerOrderEvents(admin, "o1")).resolves.toEqual([row()]);
    expect(q.listOrderEvents).toHaveBeenCalledWith(expect.anything(), "o1", {
      customerVisibleOnly: true,
    });
  });
});

describe("mapCustomerOrderEvents", () => {
  it("buckets one query's rows by order id", async () => {
    vi.mocked(q.listOrderEventsForOrders).mockResolvedValue([
      row({ id: "e1", order_id: "o1" }),
      row({ id: "e2", order_id: "o2" }),
      row({ id: "e3", order_id: "o1" }),
    ]);

    const map = await mapCustomerOrderEvents({} as never, ["o1", "o2"]);
    expect(map.get("o1")?.map((e) => e.id)).toEqual(["e1", "e3"]);
    expect(map.get("o2")?.map((e) => e.id)).toEqual(["e2"]);
    // One query for the whole list, not one per order.
    expect(q.listOrderEventsForOrders).toHaveBeenCalledTimes(1);
  });

  it("asks for customer-visible rows only", async () => {
    vi.mocked(q.listOrderEventsForOrders).mockResolvedValue([]);
    await mapCustomerOrderEvents({} as never, ["o1"]);
    expect(q.listOrderEventsForOrders).toHaveBeenCalledWith(expect.anything(), ["o1"], {
      customerVisibleOnly: true,
    });
  });
});

describe("recordOrderEvent", () => {
  it("writes through the service role", async () => {
    vi.mocked(q.insertOrderEvent).mockResolvedValue(row());
    await recordOrderEvent({ order_id: "o1", kind: "purchased", title: "x" });
    expect(q.insertOrderEvent).toHaveBeenCalledWith({ kind: "admin" }, expect.any(Object));
  });

  it("NEVER throws: a lost narrative line must not fail a committed status change", async () => {
    vi.mocked(q.insertOrderEvent).mockRejectedValue(new Error("constraint violated"));
    await expect(
      recordOrderEvent({ order_id: "o1", kind: "purchased", title: "x" }),
    ).resolves.toBeNull();
  });
});

describe("eventForStatus", () => {
  it("has a customer sentence for every transition the machine allows", () => {
    for (const status of ["processing", "in_transit", "delivered", "completed", "cancelled"]) {
      expect(eventForStatus(status)).not.toBeNull();
    }
  });

  it("leaves `paid` to the payment path, which alone knows the channel", () => {
    expect(eventForStatus("paid")).toBeNull();
  });

  it("does not resolve up the prototype chain", () => {
    expect(eventForStatus("constructor")).toBeNull();
    expect(eventForStatus("toString")).toBeNull();
  });
});
