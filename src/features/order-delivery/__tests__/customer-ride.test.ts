import { describe, expect, it } from "vitest";

import { moveShipmentsSchema } from "@/features/shipments/schema";
import { canSendOwnRide, customerRideSchema } from "../customer-ride";

const PKG = "3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90";
const base = { status: "in_transit", held: false, stage: "ghana_warehouse" as const, courierDispatched: false };

describe("who may send their own rider", () => {
  it("is offered once the parcel is at the Accra warehouse", () => {
    expect(canSendOwnRide(base)).toBe(true);
    expect(canSendOwnRide({ ...base, stage: "ready_for_pickup" })).toBe(true);
  });

  it("is not offered before it is there, on hold, or once a rider has it", () => {
    expect(canSendOwnRide({ ...base, stage: "arrived_country" })).toBe(false);
    expect(canSendOwnRide({ ...base, stage: "departed" })).toBe(false);
    expect(canSendOwnRide({ ...base, held: true })).toBe(false);
    expect(canSendOwnRide({ ...base, courierDispatched: true })).toBe(false);
    expect(canSendOwnRide({ ...base, status: "delivered" })).toBe(false);
  });
});

describe("the customer's ride request", () => {
  const soon = new Date(Date.now() + 30 * 60_000).toISOString();

  it("takes the admin hand-off's rules: a Ghana number or an https trip link", () => {
    const ok = customerRideSchema.parse({ rider: { courier_name: "Kofi", courier_phone: "024 412 3456", tracking_url: "" }, eta: soon });
    expect(ok.rider).toMatchObject({ courier_phone: "+233244123456", tracking_url: null, provider: null });
    const link = customerRideSchema.parse({ rider: { tracking_url: "https://m.uber.com/ul/?trip=1" } });
    expect(link.rider.provider).toBe("uber");
    expect(customerRideSchema.safeParse({ rider: { courier_name: "Kofi" } }).success).toBe(false);
    expect(customerRideSchema.safeParse({ rider: { courier_phone: "+1 212 555 0100" } }).success).toBe(false);
  });

  it("wants an arrival time that is soon, not past or next week", () => {
    const rider = { courier_phone: "0244123456" };
    expect(customerRideSchema.safeParse({ rider, eta: new Date(Date.now() - 3 * 3600_000).toISOString() }).success).toBe(false);
    expect(customerRideSchema.safeParse({ rider, eta: new Date(Date.now() + 5 * 86_400_000).toISOString() }).success).toBe(false);
    expect(customerRideSchema.parse({ rider, eta: null }).eta).toBeNull();
  });
});

describe("a rider on the warehouse's Out for delivery", () => {
  it("is accepted only with Out for delivery", () => {
    const rider = { courier_name: "Kofi", courier_phone: "0244123456" };
    expect(moveShipmentsSchema.parse({ package_ids: [PKG], stage: "out_for_delivery", rider }).rider).toMatchObject({
      courier_phone: "+233244123456",
    });
    expect(moveShipmentsSchema.safeParse({ package_ids: [PKG], stage: "arrived_country", rider }).success).toBe(false);
    expect(moveShipmentsSchema.parse({ package_ids: [PKG], stage: "out_for_delivery" }).rider).toBeNull();
  });
});
