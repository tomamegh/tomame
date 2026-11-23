import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://tomame.test" } } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/features/orders/services/orders.service", () => ({ getOrder: vi.fn() }));
vi.mock("@/db/queries/order-groups", () => ({ getOrderGroupById: vi.fn(), updatePaidGroupDelivery: vi.fn() }));
vi.mock("@/db/queries/orders", () => ({ listOrdersByGroup: vi.fn() }));
vi.mock("@/db/queries/delivery-zones", () => ({ listActiveDeliveryZones: vi.fn() }));
vi.mock("@/db/queries/delivery-addresses", () => ({ getDeliveryAddressById: vi.fn() }));
vi.mock("@/features/bag/services/delivery-settings.service", () => ({ isPickupEnabled: vi.fn(async () => true) }));
vi.mock("@/features/journeys/services/firm-dates.service", () => ({ firmPlansFor: vi.fn(async () => new Map()) }));
vi.mock("@/features/journeys/services/journey-detail.service", () => ({
  deliverToOf: (s: Record<string, unknown> | null) =>
    s ? { label: s.kind === "pickup" ? `Pickup · ${s.zone_name}` : `${s.label} · ${s.city}`, kind: s.kind, lines: [] } : null,
}));
vi.mock("@/features/notifications/services/customer-notify.service", () => ({ notifyCustomer: vi.fn(async () => undefined) }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));

import { getDeliveryAddressById } from "@/db/queries/delivery-addresses";
import { listActiveDeliveryZones } from "@/db/queries/delivery-zones";
import { getOrderGroupById, updatePaidGroupDelivery, type OrderGroupRow } from "@/db/queries/order-groups";
import { listOrdersByGroup } from "@/db/queries/orders";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { firmPlansFor } from "@/features/journeys/services/firm-dates.service";
import { notifyCustomer } from "@/features/notifications/services/customer-notify.service";
import { getOrder } from "@/features/orders/services/orders.service";
import type { PlatformUser } from "@/features/users/types";

import { changeOrderDelivery, getDeliveryChangeView } from "../services/delivery-change.service";

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const user = { id: "u1" } as PlatformUser;
const NOW = new Date("2026-11-24T12:00:00Z");

const zones = [
  { id: ID(1), name: "Greater Accra", kind: "door", fee_ghs: 0, extra_days: 0, note: null, sort_order: 1 },
  { id: ID(2), name: "Kumasi", kind: "door", fee_ghs: 40, extra_days: 1, note: null, sort_order: 2 },
  { id: ID(3), name: "Weija hub", kind: "pickup", fee_ghs: 0, extra_days: 0, note: "any time after landing", sort_order: 3 },
];

const group = (over: Partial<OrderGroupRow> = {}): OrderGroupRow =>
  ({
    id: "g1",
    user_id: "u1",
    status: "paid",
    item_count: 2,
    delivery_fee_ghs: 0,
    delivery_address_id: ID(8),
    delivery_zone_id: ID(1),
    delivery_address: { kind: "door", id: ID(8), label: "Home", city: "Accra", phone: "+233244123456", zone_id: ID(1), zone_name: "Greater Accra", fee_ghs: 0 },
    updated_at: "2026-11-24T12:00:00Z",
    ...over,
  }) as OrderGroupRow;

const address = (over: Record<string, unknown> = {}) => ({
  id: ID(9), user_id: "u1", label: "Office", kind: "door", recipient_name: "Ama", phone: "0207778888", line1: "5 Ring Rd", line2: null,
  area: "Osu", city: "Accra", region: null, delivery_zone_id: ID(1), digital_address: null, latitude: null, longitude: null,
  is_default: false, created_at: "", updated_at: "", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOrder).mockResolvedValue({ id: "o1", order_group_id: "g1" } as never);
  vi.mocked(getOrderGroupById).mockResolvedValue(group());
  vi.mocked(listOrdersByGroup).mockResolvedValue([
    { id: "o1", status: "processing", order_no: "TM-1", product_name: "Kettle" },
    { id: "o2", status: "paid", order_no: "TM-2", product_name: "Lamp" },
  ] as never);
  vi.mocked(listActiveDeliveryZones).mockResolvedValue(zones as never);
  vi.mocked(updatePaidGroupDelivery).mockImplementation(async (_id, patch) => group(patch));
});

describe("changeOrderDelivery", () => {
  it("switches door to pickup at the same fee, audits it and tells the customer once", async () => {
    const out = await changeOrderDelivery(user, "o1", { delivery_zone_id: ID(3) }, NOW);
    expect(out).toMatchObject({ changed: true, deliverTo: { label: "Pickup · Weija hub" } });
    expect(updatePaidGroupDelivery).toHaveBeenCalledWith("g1", {
      delivery_address: { kind: "pickup", zone_id: ID(3), zone_name: "Weija hub", fee_ghs: 0 },
      delivery_address_id: null,
      delivery_zone_id: ID(3),
    });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "order_group_delivery_changed", entityId: "g1" }));
    expect(notifyCustomer).toHaveBeenCalledTimes(1);
    const call = vi.mocked(notifyCustomer).mock.calls[0]![0];
    expect(call.event).toBe("delivery_details_changed");
    expect(call.payload).toMatchObject({ order_count: 2, deliver_to: "Pickup · Weija hub" });
    expect(call.template.subject).toBe("Delivery changed: 2 of your orders");
  });

  it("moves to another saved address in a same-fee zone, with its phone", async () => {
    vi.mocked(getDeliveryAddressById).mockResolvedValue(address() as never);
    await changeOrderDelivery(user, "o1", { delivery_address_id: ID(9) }, NOW);
    const patch = vi.mocked(updatePaidGroupDelivery).mock.calls[0]![1];
    expect(patch).toMatchObject({ delivery_address_id: ID(9), delivery_zone_id: ID(1), delivery_address: { kind: "door", label: "Office", phone: "0207778888" } });
    expect(JSON.stringify(vi.mocked(notifyCustomer).mock.calls[0]![0].whatsapp.message)).toContain("our rider will call");
  });

  it("refuses a zone with a different fee and sends them to the team", async () => {
    vi.mocked(getDeliveryAddressById).mockResolvedValue(address({ delivery_zone_id: ID(2) }) as never);
    await expect(changeOrderDelivery(user, "o1", { delivery_address_id: ID(9) }, NOW)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/Kumasi costs a different amount.*Message us/),
    });
    expect(updatePaidGroupDelivery).not.toHaveBeenCalled();
  });

  it("refuses someone else's address and an incomplete phone", async () => {
    vi.mocked(getDeliveryAddressById).mockResolvedValueOnce(address({ user_id: "u2" }) as never);
    await expect(changeOrderDelivery(user, "o1", { delivery_address_id: ID(9) }, NOW)).rejects.toMatchObject({ statusCode: 404 });
    vi.mocked(getDeliveryAddressById).mockResolvedValueOnce(address({ phone: "024" }) as never);
    await expect(changeOrderDelivery(user, "o1", { delivery_address_id: ID(9) }, NOW)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses after the box for its flight has closed", async () => {
    vi.mocked(firmPlansFor).mockResolvedValueOnce(
      new Map([["o1", { kind: "firm", flight: { carrier: "Delta Cargo", origin: "JFK", destination: "ACC", departsOn: "2026-11-25", cutoffAt: "2026-11-24T00:00:00Z" }, deliveryOn: "2026-11-28", basis: "hub_arrival" }]]) as never,
    );
    await expect(changeOrderDelivery(user, "o1", { delivery_zone_id: ID(3) }, NOW)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/has closed/) });
    expect(updatePaidGroupDelivery).not.toHaveBeenCalled();
  });

  it("says nothing when the choice is what it already is", async () => {
    vi.mocked(getOrderGroupById).mockResolvedValue(group({ delivery_address: { kind: "pickup", zone_id: ID(3), zone_name: "Weija hub", fee_ghs: 0 }, delivery_zone_id: ID(3) }));
    const out = await changeOrderDelivery(user, "o1", { delivery_zone_id: ID(3) }, NOW);
    expect(out.changed).toBe(false);
    expect(updatePaidGroupDelivery).not.toHaveBeenCalled();
    expect(notifyCustomer).not.toHaveBeenCalled();
  });
});

describe("getDeliveryChangeView", () => {
  it("offers only same-fee door zones and marks pickup by fee", async () => {
    vi.mocked(getOrderGroupById).mockResolvedValue(group({ delivery_fee_ghs: 40, delivery_zone_id: ID(2) }));
    const view = await getDeliveryChangeView(user, "o1", NOW);
    expect(view).toMatchObject({ feeGhs: 40, doorZoneIds: [ID(2)], pickupZones: [{ id: ID(3), sameFee: false }], lock: { editable: true, until: null } });
    expect(view?.current).toMatchObject({ kind: "door", phone: "+233244123456" });
  });

  it("is null for an order with no checkout", async () => {
    vi.mocked(getOrder).mockResolvedValue({ id: "o1", order_group_id: null } as never);
    expect(await getDeliveryChangeView(user, "o1", NOW)).toBeNull();
  });
});
