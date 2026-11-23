import { describe, expect, it } from "vitest";

import type { BagView } from "@/features/bag/types";
import type { HomeOrder } from "@/features/app-home/types";
import type { Notification } from "@/features/notifications/types";
import { appHref, buildAppAlerts, buildAppReminders, MAX_ALERTS } from "../alerts";

const NOW = new Date("2026-11-23T10:00:00Z");

const bag = (over: Partial<BagView> = {}): BagView =>
  ({
    lines: [{ id: "l1" }],
    boxes: [{ id: "b1", cutoff_at: "2026-11-26T18:00:00Z", item_count: 2 }],
    rate_locked_until: "2026-11-24T09:00:00Z",
    ...over,
  }) as unknown as BagView;

const order = (over: Partial<HomeOrder> & { eta?: HomeOrder["eta"] } = {}): HomeOrder =>
  ({
    id: "o1",
    orderNo: "TM-00038",
    productName: "BRIO Railway Set",
    track: { isComplete: false, isCancelled: false },
    eta: { from: "2026-11-28T00:00:00Z", to: "2026-11-30T00:00:00Z", source: "confirmed" },
    ...over,
  }) as unknown as HomeOrder;

describe("buildAppReminders", () => {
  it("reminds before the box closes, before the rate lock ends, and on the delivery morning", () => {
    const r = buildAppReminders({ bag: bag(), orders: [order()], now: NOW });
    expect(r.map((x) => [x.key, x.at, x.href])).toEqual([
      ["lock:2026-11-24T09:00:00Z", "2026-11-24T07:00:00.000Z", "/m/bag"],
      ["box:b1:2026-11-26T18:00:00Z", "2026-11-26T15:00:00.000Z", "/m/bag"],
      ["eta:o1:2026-11-28T00:00:00Z", "2026-11-28T09:00:00.000Z", "/m/orders/o1"],
    ]);
    expect(r[1]!.title).toBe("Your box to Accra closes at 6 pm");
    expect(r[1]!.body).toContain("2 items are sharing freight");
    expect(r[2]!.title).toBe("Your parcel is due today");
  });

  it("says 'could arrive' for an estimated date", () => {
    const r = buildAppReminders({ bag: null, orders: [order({ eta: { from: "2026-11-28T00:00:00Z", to: null, source: "estimated" } })], now: NOW });
    expect(r[0]!.title).toBe("Your parcel could arrive today");
  });

  it("schedules nothing for an empty bag, past times, or finished orders", () => {
    expect(buildAppReminders({ bag: bag({ lines: [] }), orders: [], now: NOW })).toEqual([]);
    const past = bag({ boxes: [{ id: "b1", cutoff_at: "2026-11-23T12:00:00Z", item_count: 1 }] as BagView["boxes"], rate_locked_until: "2026-11-23T11:00:00Z" });
    expect(buildAppReminders({ bag: past, orders: [], now: NOW })).toEqual([]);
    const done = order({ track: { isComplete: true, isCancelled: false } as HomeOrder["track"] });
    expect(buildAppReminders({ bag: null, orders: [done], now: NOW })).toEqual([]);
  });
});

const note = (id: string, event: string, at: string, payload: Record<string, unknown> = {}, channel: Notification["channel"] = "email"): Notification =>
  ({ id, user_id: "u", channel, event, payload, status: "sent", created_at: at, sent_at: at, read_at: null }) as Notification;

describe("buildAppAlerts", () => {
  const since = new Date("2026-11-23T08:00:00Z");

  it("returns only news after `since`, newest first, once per event across channels", () => {
    const list = [
      note("1", "price_drop", "2026-11-23T07:00:00Z", { product_name: "Old" }),
      note("2", "price_drop", "2026-11-23T09:00:00Z", { product_name: "Sony WH-1000XM5" }),
      note("3", "price_drop", "2026-11-23T09:00:01Z", { product_name: "Sony WH-1000XM5" }, "whatsapp"),
      note("4", "order_placed_admin", "2026-11-23T09:30:00Z"),
      note("5", "shipment_update", "2026-11-23T09:45:00Z", { order_no: "TM-00038" }),
    ];
    const alerts = buildAppAlerts(list, since);
    expect(alerts.map((a) => a.id)).toEqual(["5", "3"]);
    expect(alerts.every((a) => a.href.startsWith("/m"))).toBe(true);
  });

  it("caps how many alerts one check posts", () => {
    const list = Array.from({ length: 9 }, (_, i) => note(String(i), "shipment_update", `2026-11-23T09:0${i}:00Z`, { order_no: `TM-0000${i}` }));
    expect(buildAppAlerts(list, since)).toHaveLength(MAX_ALERTS);
  });
});

describe("appHref", () => {
  it("opens the app's own screen for a website link", () => {
    expect(appHref("/app/bag")).toBe("/m/bag");
    expect(appHref("/app/orders/6f1c2a1e-3b4d-4c5e-8f90-1a2b3c4d5e6f")).toBe("/m/orders/6f1c2a1e-3b4d-4c5e-8f90-1a2b3c4d5e6f");
    expect(appHref("/m/watch")).toBe("/m/watch");
    expect(appHref(null)).toBe("/m");
    expect(appHref("/app/cars")).toBe("/m");
  });
});
