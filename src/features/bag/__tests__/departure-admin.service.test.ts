import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://tomame.test" } } }));
vi.mock("@/db/queries/flight-departures", () => ({
  getDepartureById: vi.fn(),
  moveDeparture: vi.fn(),
  cancelDeparture: vi.fn(),
}));
vi.mock("@/db/queries/order-firm-dates", () => ({ listOrdersAwaitingDelivery: vi.fn() }));
vi.mock("@/features/journeys/services/firm-dates.service", () => ({
  samePlan: (a: { deliveryOn: string; flight: { departsOn: string } }, b: { deliveryOn: string; flight: { departsOn: string } }) =>
    a.deliveryOn === b.deliveryOn && a.flight.departsOn === b.flight.departsOn,
  firmPlansFor: vi.fn(),
  recordFirmDates: vi.fn(async () => undefined),
}));
vi.mock("@/features/notifications/services/customer-notify.service", () => ({ notifyCustomer: vi.fn(async () => undefined) }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));

import { cancelDeparture, getDepartureById, moveDeparture, type FlightDepartureRow } from "@/db/queries/flight-departures";
import { listOrdersAwaitingDelivery } from "@/db/queries/order-firm-dates";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { firmPlansFor, recordFirmDates, type FirmPlan } from "@/features/journeys/services/firm-dates.service";
import { notifyCustomer } from "@/features/notifications/services/customer-notify.service";

import { cancelDepartureByStaff, moveDepartureByStaff } from "../services/departure-admin.service";

const ID = "11111111-1111-4111-8111-111111111111";
const NEW_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-23T12:00:00Z");

const departure = (over: Partial<FlightDepartureRow> = {}): FlightDepartureRow => ({
  id: ID,
  region_code: "USA",
  carrier: "Delta Cargo",
  origin: "JFK",
  destination: "ACC",
  departs_on: "2026-11-27",
  departs_at: "2026-11-27T20:00:00Z",
  cutoff_at: "2026-11-26T20:00:00Z",
  status: "scheduled",
  awb: null,
  ...over,
});

const plan = (departsOn: string, deliveryOn: string): FirmPlan => ({
  kind: "firm",
  flight: { carrier: "Delta Cargo", origin: "JFK", destination: "ACC", departsOn, cutoffAt: `${departsOn}T00:00:00Z` },
  deliveryOn,
  basis: "hub_arrival",
});

const orders = [
  { id: "o1", user_id: "u1", order_no: "TM-1", product_name: "Kettle", status: "processing" },
  { id: "o2", user_id: "u1", order_no: "TM-2", product_name: "Lamp", status: "processing" },
  { id: "o3", user_id: "u2", order_no: "TM-3", product_name: "Shoes", status: "processing" },
  { id: "o4", user_id: "u3", order_no: "TM-4", product_name: "Book", status: "processing" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listOrdersAwaitingDelivery).mockResolvedValue(orders);
  vi.mocked(getDepartureById).mockImplementation(async (id) =>
    id === ID ? departure() : departure({ id: NEW_ID, departs_on: "2026-11-28", departs_at: "2026-11-28T20:00:00Z", cutoff_at: "2026-11-27T20:00:00Z" }),
  );
});

describe("moveDepartureByStaff", () => {
  it("re-dates only the orders whose date changed, one message per customer", async () => {
    vi.mocked(firmPlansFor)
      .mockResolvedValueOnce(new Map([
        ["o1", plan("2026-11-27", "2026-11-30")],
        ["o2", plan("2026-11-27", "2026-11-30")],
        ["o3", plan("2026-11-27", "2026-11-30")],
        ["o4", plan("2026-12-02", "2026-12-05")],
      ]))
      .mockResolvedValueOnce(new Map([
        ["o1", plan("2026-11-28", "2026-12-01")],
        ["o2", plan("2026-11-28", "2026-12-01")],
        ["o3", plan("2026-11-28", "2026-12-01")],
        ["o4", plan("2026-12-02", "2026-12-05")],
      ]));
    vi.mocked(moveDeparture).mockResolvedValue(NEW_ID);

    const out = await moveDepartureByStaff("admin-1", ID, { date: "2026-11-28", time: "20:00" }, NOW);

    // The cutoff keeps its 24 hours before the flight.
    expect(moveDeparture).toHaveBeenCalledWith(ID, "2026-11-28T20:00:00.000Z", "2026-11-27T20:00:00.000Z");
    expect(out).toMatchObject({ redated: 3, notified: 2, departure: { id: NEW_ID } });
    const recorded = vi.mocked(recordFirmDates).mock.calls[0]!;
    expect([...recorded[0].keys()].sort()).toEqual(["o1", "o2", "o3"]);
    expect(recorded[1]).toBe("departure_moved");

    expect(notifyCustomer).toHaveBeenCalledTimes(2);
    const u1 = vi.mocked(notifyCustomer).mock.calls.find((c) => c[0].userId === "u1")![0];
    expect(u1.event).toBe("delivery_date_changed");
    expect(u1.payload).toMatchObject({ order_ids: ["o1", "o2"], order_count: 2, delivery_on: "2026-12-01", change: "moved" });
    expect(u1.template.subject).toBe("New delivery date: 2 of your orders");
    expect(u1.template.html).toContain("Delta Cargo JFK → Accra, Sat 28 Nov");
    expect(u1.template.html).toContain("By Tue 1 Dec");
    expect(JSON.stringify(u1.whatsapp.message)).toContain("by Tue 1 Dec");

    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "flight_departure_moved", entityId: ID }));
  });

  it("refuses a time in the past before touching anything", async () => {
    await expect(moveDepartureByStaff("admin-1", ID, { date: "2026-11-20", time: "10:00" }, NOW)).rejects.toMatchObject({ statusCode: 400 });
    expect(moveDeparture).not.toHaveBeenCalled();
  });

  it("names a day that already has a flight", async () => {
    vi.mocked(firmPlansFor).mockResolvedValue(new Map());
    vi.mocked(moveDeparture).mockRejectedValue(new Error("day_taken"));
    await expect(moveDepartureByStaff("admin-1", ID, { date: "2026-11-25", time: "20:00" }, NOW)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/already a flight that day/),
    });
    expect(notifyCustomer).not.toHaveBeenCalled();
  });

  it("refuses a flight that has left, and an id that is not one", async () => {
    vi.mocked(getDepartureById).mockResolvedValueOnce(departure({ status: "departed" }));
    await expect(moveDepartureByStaff("admin-1", ID, { date: "2026-11-28", time: "20:00" }, NOW)).rejects.toMatchObject({ statusCode: 409 });
    await expect(moveDepartureByStaff("admin-1", "nope", { date: "2026-11-28", time: "20:00" }, NOW)).rejects.toMatchObject({ statusCode: 404 });
    expect(moveDeparture).not.toHaveBeenCalled();
  });
});

describe("cancelDepartureByStaff", () => {
  it("says nothing when no date changes", async () => {
    vi.mocked(firmPlansFor).mockResolvedValue(new Map([["o4", plan("2026-12-02", "2026-12-05")]]));
    vi.mocked(cancelDeparture).mockResolvedValue(NEW_ID);
    const out = await cancelDepartureByStaff("admin-1", ID, NOW);
    expect(out).toMatchObject({ redated: 0, notified: 0 });
    expect(notifyCustomer).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "flight_departure_cancelled" }));
  });

  it("tells the customer the flight was cancelled", async () => {
    vi.mocked(firmPlansFor)
      .mockResolvedValueOnce(new Map([["o3", plan("2026-11-27", "2026-11-30")]]))
      .mockResolvedValueOnce(new Map([["o3", plan("2026-12-02", "2026-12-05")]]));
    vi.mocked(cancelDeparture).mockResolvedValue(NEW_ID);
    await cancelDepartureByStaff("admin-1", ID, NOW);
    const call = vi.mocked(notifyCustomer).mock.calls[0]![0];
    expect(call.payload).toMatchObject({ change: "cancelled", order_no: "TM-3" });
    expect(call.template.html).toContain("was cancelled");
    expect(vi.mocked(recordFirmDates).mock.calls[0]![1]).toBe("departure_cancelled");
  });
});
