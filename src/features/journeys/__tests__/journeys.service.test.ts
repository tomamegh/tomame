import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/features/orders/services/orders.service", () => ({ listUserOrders: vi.fn() }));
vi.mock("@/features/orders/services/order-events.service", () => ({
  mapCustomerOrderEvents: vi.fn(async () => new Map()),
}));
vi.mock("@/db/queries/order-groups", () => ({ listOrderGroupsByIds: vi.fn(async () => []) }));

import type { OrderEventRow } from "@/db/queries/order-events";
import { listOrderGroupsByIds, type OrderGroupRow } from "@/db/queries/order-groups";
import { mapCustomerOrderEvents } from "@/features/orders/services/order-events.service";
import { listUserOrders } from "@/features/orders/services/orders.service";
import type { Order } from "@/features/orders/types";
import type { PlatformUser } from "@/features/users/types";
import { getJourneys } from "../services/journeys.service";

const user = { id: "u1", profile: { role: "user" } } as unknown as PlatformUser;

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: "o1",
    order_no: "TM-00001",
    user_id: "u1",
    payment_id: null,
    status: "paid",
    product_url: "https://www.amazon.com/dp/B09XS7JWHH",
    product_name: "Sony WH-1000XM5",
    product_image_url: null,
    estimated_price_usd: 298,
    quantity: 1,
    origin_country: "USA",
    special_instructions: null,
    pricing: { total_ghs: 5041.16 },
    tracking_number: null,
    carrier: null,
    estimated_delivery_date: null,
    delivered_at: null,
    extraction_data: null,
    needs_review: false,
    review_reasons: [],
    reviewed_by: null,
    reviewed_at: null,
    extraction_metadata: null,
    extraction_cache_id: null,
    admin_total_ghs: null,
    admin_pricing_note: null,
    pricing_set_by: null,
    pricing_set_at: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...over,
  }) as unknown as Order;

const event = (over: Partial<OrderEventRow> & Pick<OrderEventRow, "order_id" | "kind">): OrderEventRow => ({
  id: "e1",
  order_group_id: null,
  title: "t",
  detail: null,
  location: null,
  weight_lbs: null,
  occurred_at: "2026-09-06T14:02:00Z",
  is_customer_visible: true,
  created_by: null,
  created_at: "2026-09-06T14:02:00Z",
  ...over,
});

const group = (over: Partial<OrderGroupRow> = {}): OrderGroupRow =>
  ({ id: "g1", user_id: "u1", status: "pending", item_count: 2, ...over }) as OrderGroupRow;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mapCustomerOrderEvents).mockResolvedValue(new Map());
  vi.mocked(listOrderGroupsByIds).mockResolvedValue([]);
});

describe("filter pills", () => {
  it("counts real orders, not the mock's samples", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({
      count: 5,
      orders: [
        order({ id: "a", status: "paid" }),
        order({ id: "b", status: "processing" }),
        order({ id: "c", status: "in_transit" }),
        order({ id: "d", status: "delivered" }),
        order({ id: "e", status: "pending" }),
      ],
    });

    const view = await getJourneys(user);
    expect(view.filters).toEqual([
      { key: "moving", label: "Moving", count: 3 },
      { key: "delivered", label: "Delivered", count: 1 },
      { key: "awaiting_payment", label: "Awaiting payment", count: 1 },
    ]);
  });

  it("puts a cancelled order behind no pill at all", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({
      count: 1,
      orders: [order({ status: "cancelled" })],
    });

    const view = await getJourneys(user);
    expect(view.filters.every((f) => f.count === 0)).toBe(true);
    expect(view.rows[0]!.filter).toBeNull();
    // The row still exists — it is history, not a deletion.
    expect(view.rows).toHaveLength(1);
  });

  it("shows a zero rather than dropping a pill", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({ count: 0, orders: [] });
    expect((await getJourneys(user)).filters).toHaveLength(3);
  });
});

describe("the 'Where things are' census", () => {
  it("counts each parcel ONCE, on the stop it occupies", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({
      count: 3,
      orders: [
        order({ id: "a", status: "paid" }),
        order({ id: "b", status: "processing" }),
        order({ id: "c", status: "in_transit" }),
      ],
    });

    const counts = Object.fromEntries(
      (await getJourneys(user)).stops.map((stop) => [stop.key, stop.count]),
    );
    expect(counts).toEqual({ paid: 1, purchased: 1, hub: 0, in_the_air: 1, your_door: 0 });
  });

  it("moves a parcel to the hub on an event, with no change to its status", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({
      count: 1,
      orders: [order({ id: "a", status: "processing" })],
    });
    vi.mocked(mapCustomerOrderEvents).mockResolvedValue(
      new Map([["a", [event({ order_id: "a", kind: "hub_received" })]]]),
    );

    const view = await getJourneys(user);
    expect(view.stops.find((s) => s.key === "hub")?.count).toBe(1);
    expect(view.stops.find((s) => s.key === "purchased")?.count).toBe(0);
    // The status itself is untouched: no eighth state was invented.
    expect(view.rows[0]!.status).toBe("processing");
  });

  it("stands unpaid and cancelled orders on no stop", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({
      count: 2,
      orders: [order({ id: "a", status: "pending" }), order({ id: "b", status: "cancelled" })],
    });

    const total = (await getJourneys(user)).stops.reduce((sum, s) => sum + s.count, 0);
    expect(total).toBe(0);
  });
});

describe("rows", () => {
  it("offers 'Pay now' for an unpaid order whose group is still pending", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({
      count: 1,
      orders: [order({ status: "pending", order_group_id: "g1" })],
    });
    vi.mocked(listOrderGroupsByIds).mockResolvedValue([group({ status: "pending" })]);

    const row = (await getJourneys(user)).rows[0]!;
    expect(row.cta).toBe("pay");
    expect(row.isPayable).toBe(true);
    expect(row.orderGroupId).toBe("g1");
  });

  it("does NOT offer 'Pay now' when the group has already been paid", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({
      count: 1,
      orders: [order({ status: "pending", order_group_id: "g1" })],
    });
    vi.mocked(listOrderGroupsByIds).mockResolvedValue([group({ status: "paid" })]);

    const row = (await getJourneys(user)).rows[0]!;
    expect(row.isPayable).toBe(false);
    expect(row.cta).toBe("details");
  });

  it("pays a legacy order with no group on its own", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({
      count: 1,
      orders: [order({ status: "pending", order_group_id: null })],
    });

    const row = (await getJourneys(user)).rows[0]!;
    expect(row.isPayable).toBe(true);
    expect(row.orderGroupId).toBeNull();
  });

  it("offers 'Buy again' once delivered, and 'Track' in the air", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({
      count: 2,
      orders: [
        order({ id: "a", status: "delivered" }),
        order({ id: "b", status: "in_transit" }),
      ],
    });

    const rows = (await getJourneys(user)).rows;
    expect(rows.find((r) => r.id === "a")?.cta).toBe("buy_again");
    expect(rows.find((r) => r.id === "b")?.cta).toBe("track");
  });

  it("numbers a bag's lines '1 of 2' in checkout order, and leaves a lone order unnumbered", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({
      count: 3,
      orders: [
        order({ id: "b", order_group_id: "g1", created_at: "2026-09-02T00:00:00Z" }),
        order({ id: "a", order_group_id: "g1", created_at: "2026-09-01T00:00:00Z" }),
        order({ id: "c", order_group_id: null }),
      ],
    });
    vi.mocked(listOrderGroupsByIds).mockResolvedValue([group()]);

    const rows = (await getJourneys(user)).rows;
    expect(rows.find((r) => r.id === "a")?.groupPosition).toEqual({ index: 1, total: 2 });
    expect(rows.find((r) => r.id === "b")?.groupPosition).toEqual({ index: 2, total: 2 });
    expect(rows.find((r) => r.id === "c")?.groupPosition).toBeNull();
  });

  it("names the store from the registry rather than a bare hostname", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({ count: 1, orders: [order()] });
    expect((await getJourneys(user)).rows[0]!.store).toBe("Amazon");
  });

  it("prefers the admin's total override to the stored breakdown", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({
      count: 1,
      orders: [order({ admin_total_ghs: 4999 })],
    });
    expect((await getJourneys(user)).rows[0]!.totalGhs).toBe(4999);
  });
});

describe("the hint under the bar", () => {
  it("prints what actually last happened", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({
      count: 1,
      orders: [order({ id: "a", status: "in_transit" })],
    });
    vi.mocked(mapCustomerOrderEvents).mockResolvedValue(
      new Map([
        [
          "a",
          [
            event({
              order_id: "a",
              kind: "departed",
              title: "On its way to Accra",
              location: "Cincinnati",
              occurred_at: "2026-09-08T22:14:00Z",
            }),
          ],
        ],
      ]),
    );

    expect((await getJourneys(user)).rows[0]!.hint).toBe(
      "On its way to Accra · Cincinnati · 8 Sep",
    );
  });

  it("falls back to the delivery window when nothing has been logged", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({
      count: 1,
      orders: [order({ status: "in_transit", eta_from: "2026-09-18", eta_to: "2026-09-20" })],
    });

    expect((await getJourneys(user)).rows[0]!.hint).toBe("At your door Fri 18 – Sun 20 Sep");
  });

  it("never invents a date — the stage's own hint is the last resort", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({
      count: 1,
      orders: [order({ status: "paid" })],
    });

    const hint = (await getJourneys(user)).rows[0]!.hint;
    expect(hint).toBe("Date set when it ships");
    expect(hint).not.toMatch(/\d{1,2} [A-Z][a-z]{2}/);
  });
});
