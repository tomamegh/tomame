import { describe, expect, it } from "vitest";

import {
  DEFAULT_STAGE_SETTINGS,
  activeNotice,
  currentStageKey,
  deriveShipmentProgress,
  nextMovableStage,
  reachedRank,
  transitLabel,
  type StageEvent,
} from "../stages";
import { contactPhoneSchema, moveShipmentsSchema, shipmentNoticeSchema } from "../schema";

const ev = (kind: string, occurred_at: string, over: Partial<StageEvent> = {}): StageEvent => ({
  kind,
  title: kind,
  detail: null,
  location: null,
  occurred_at,
  ...over,
});

const settings = {
  ...DEFAULT_STAGE_SETTINGS,
  arrived_country: {
    ...DEFAULT_STAGE_SETTINGS.arrived_country,
    contact_name: "Customs desk",
    contact_phone: "+233244123456",
  },
};

describe("where an order is", () => {
  it("reads the status alone when no leg was logged", () => {
    expect(currentStageKey("in_transit", [])).toBe("departed");
    expect(currentStageKey("processing", [])).toBe("purchased");
    expect(currentStageKey("delivered", [])).toBe("delivered");
    expect(currentStageKey("pending", [])).toBeNull();
    expect(currentStageKey("cancelled", [ev("arrived_country", "2026-11-02")])).toBeNull();
  });

  it("lets an event move it ahead of its status, never behind", () => {
    const events = [ev("departed", "2026-11-01"), ev("ghana_warehouse", "2026-11-04")];
    expect(currentStageKey("in_transit", events)).toBe("ghana_warehouse");
    expect(reachedRank("delivered", [ev("arrived_country", "2026-11-02")])).toBe(7);
  });

  it("names the last-mile step by the event that happened", () => {
    expect(currentStageKey("in_transit", [ev("ready_for_pickup", "2026-11-05")])).toBe("ready_for_pickup");
    expect(currentStageKey("in_transit", [ev("out_for_delivery", "2026-11-05")])).toBe("out_for_delivery");
  });

  it("labels a parcel on its way by its leg", () => {
    expect(transitLabel("in_transit", [ev("arrived_country", "2026-11-02")], "In the air")).toBe("Arrived in Ghana");
    expect(transitLabel("processing", [], "Purchased")).toBe("Purchased");
  });
});

describe("the customer's progress list", () => {
  it("marks done, current and next, with the contact on the current step", () => {
    const progress = deriveShipmentProgress({
      status: "in_transit",
      events: [ev("payment_received", "2026-10-20"), ev("departed", "2026-11-01"), ev("arrived_country", "2026-11-02")],
      settings,
    });
    const byKey = Object.fromEntries(progress.steps.map((s) => [s.key, s]));
    expect(byKey.departed?.state).toBe("done");
    expect(byKey.arrived_country?.state).toBe("current");
    expect(byKey.arrived_country?.description).toBe("Landed and clearing customs.");
    expect(byKey.arrived_country?.contact).toEqual({ name: "Customs desk", phone: "+233244123456", whatsapp: true, hours: null });
    expect(byKey.ghana_warehouse?.state).toBe("next");
    expect(byKey.departed?.contact).toBeNull();
  });

  it("shows one last-mile step, picked by the delivery kind", () => {
    const pickup = deriveShipmentProgress({ status: "in_transit", events: [], settings, deliveryKind: "pickup" });
    expect(pickup.steps.map((s) => s.key)).toContain("ready_for_pickup");
    expect(pickup.steps.map((s) => s.key)).not.toContain("out_for_delivery");
    const door = deriveShipmentProgress({ status: "in_transit", events: [], settings, deliveryKind: "door" });
    expect(door.steps.map((s) => s.key)).toContain("out_for_delivery");
  });

  it("prefers the update's own words and contact over the step defaults", () => {
    const progress = deriveShipmentProgress({
      status: "in_transit",
      events: [
        ev("arrived_country", "2026-11-02", {
          detail: "Flight KQ512 landed early",
          contact_name: "Kofi",
          contact_phone: "+233201112222",
        }),
      ],
      settings,
    });
    const current = progress.steps.find((s) => s.state === "current");
    expect(current?.description).toBe("Flight KQ512 landed early");
    expect(current?.contact?.name).toBe("Kofi");
  });

  it("finishes every step once delivered", () => {
    const progress = deriveShipmentProgress({ status: "delivered", events: [], settings });
    expect(progress.steps.every((s) => s.state === "done")).toBe(true);
    expect(progress.notice).toBeNull();
  });
});

describe("delay notices", () => {
  const stepAt = "2026-11-02T10:00:00Z";
  it("is live when newer than the step and not cleared", () => {
    const events = [ev("delay", "2026-11-03T09:00:00Z", { detail: "Customs inspection", expected_on: "2026-11-06" })];
    expect(activeNotice(events, stepAt, settings.arrived_country)).toMatchObject({
      message: "Customs inspection",
      expectedOn: "2026-11-06",
      contact: { phone: "+233244123456" },
    });
  });

  it("goes away when the parcel moves on or someone clears it", () => {
    const delay = ev("delay", "2026-11-03T09:00:00Z", { detail: "x" });
    expect(activeNotice([delay], "2026-11-04T00:00:00Z", null)).toBeNull();
    expect(activeNotice([delay, ev("delay_cleared", "2026-11-03T12:00:00Z")], stepAt, null)).toBeNull();
  });
});

describe("next step for staff", () => {
  it("walks forward and chooses pickup only when everyone collects", () => {
    expect(nextMovableStage("departed")).toBe("arrived_country");
    expect(nextMovableStage("arrived_country")).toBe("ghana_warehouse");
    expect(nextMovableStage("ghana_warehouse")).toBe("out_for_delivery");
    expect(nextMovableStage("ghana_warehouse", true)).toBe("ready_for_pickup");
    expect(nextMovableStage("ready_for_pickup")).toBe("delivered");
    expect(nextMovableStage("delivered")).toBeNull();
  });
});

describe("schemas", () => {
  it("normalises a contact number and parses its own output", () => {
    const once = contactPhoneSchema.parse("024 412 3456");
    expect(once).toBe("+233244123456");
    expect(contactPhoneSchema.parse(once)).toBe(once);
    expect(contactPhoneSchema.parse("+1 212 555 0100")).toBe("+12125550100");
    expect(contactPhoneSchema.parse("")).toBeNull();
    expect(contactPhoneSchema.safeParse("12345").success).toBe(false);
  });

  it("needs something to move and a reason for a delay", () => {
    expect(moveShipmentsSchema.safeParse({ stage: "arrived_country" }).success).toBe(false);
    expect(
      moveShipmentsSchema.safeParse({ stage: "arrived_country", package_ids: ["3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90"] }).success,
    ).toBe(true);
    expect(shipmentNoticeSchema.safeParse({ order_ids: ["3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90"] }).success).toBe(false);
    expect(
      shipmentNoticeSchema.safeParse({ order_ids: ["3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90"], clear: true }).success,
    ).toBe(true);
  });
});
