import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://tomame.test" } } }));
vi.mock("@/db/queries/inbound-parcels", () => ({ listInboundLinks: vi.fn(async () => []) }));
vi.mock("@/features/notifications/services/customer-notify.service", () => ({ notifyCustomer: vi.fn(async () => undefined) }));
vi.mock("@/features/warehouse/services/warehouse.service", () => ({ listWarehouseItemsByIds: vi.fn() }));
vi.mock("@/features/warehouse/services/inbound.service", () => ({ registerInboundTracking: vi.fn() }));

import { listInboundLinks } from "@/db/queries/inbound-parcels";
import { notifyCustomer } from "@/features/notifications/services/customer-notify.service";
import type { PlatformUser } from "@/features/users/types";
import { registerInboundTracking } from "@/features/warehouse/services/inbound.service";
import { listWarehouseItemsByIds } from "@/features/warehouse/services/warehouse.service";

import { addOrdersStoreTracking } from "../services/order-tracking.service";
import type { InboundParcel, WarehouseItem } from "../types";

const operator = { id: "op-1", email: "op@tomame.local", app_metadata: { role: "warehouse" } } as unknown as PlatformUser;

function item(id: string, over: Partial<WarehouseItem> = {}): WarehouseItem {
  return {
    order_id: id,
    order_no: `TM-${id}`,
    title: `Item ${id}`,
    order_status: "processing",
    customer_key: "cust-1",
    received: null,
    ...over,
  } as WarehouseItem;
}
const parcel = { id: "ip-1", carrier_label: "UPS", tracking_display: "1Z 999 AA1 01 2345 6784" } as InboundParcel;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(registerInboundTracking).mockResolvedValue(parcel);
  vi.mocked(listInboundLinks).mockResolvedValue([]);
});

describe("addOrdersStoreTracking", () => {
  it("saves the number on each order and tells each customer once", async () => {
    vi.mocked(listWarehouseItemsByIds).mockResolvedValue([item("a"), item("b"), item("c", { customer_key: "cust-2" })]);
    const out = await addOrdersStoreTracking(operator, { order_ids: ["a", "b", "c"], tracking_numbers: ["1Z999AA10123456784"] });
    expect(out.added).toEqual(["a", "b", "c"]);
    expect(out.notified).toBe(2);
    expect(notifyCustomer).toHaveBeenCalledTimes(2);
    const first = vi.mocked(notifyCustomer).mock.calls[0]![0];
    expect(first.event).toBe("store_tracking_added");
    // Tomame's number only unless staff ticked "share".
    expect(JSON.stringify(first.whatsapp.message)).not.toContain("1Z 999");
  });

  it("turns a carrier link into its number", async () => {
    vi.mocked(listWarehouseItemsByIds).mockResolvedValue([item("a")]);
    await addOrdersStoreTracking(operator, { order_ids: ["a"], tracking_numbers: ["https://www.ups.com/track?tracknum=1Z999AA10123456784"] });
    expect(vi.mocked(registerInboundTracking).mock.calls[0]![1].tracking_number).toBe("1Z999AA10123456784");
  });

  it("includes the store number only when shared", async () => {
    vi.mocked(listWarehouseItemsByIds).mockResolvedValue([item("a")]);
    await addOrdersStoreTracking(operator, { order_ids: ["a"], tracking_numbers: ["1Z999AA10123456784"], share_store_tracking: true });
    expect(JSON.stringify(vi.mocked(notifyCustomer).mock.calls[0]![0].whatsapp.message)).toContain("UPS 1Z 999");
  });

  it("says nothing when the order already had tracking (a correction or an extra number)", async () => {
    vi.mocked(listWarehouseItemsByIds).mockResolvedValue([item("a")]);
    vi.mocked(listInboundLinks).mockResolvedValue([{ parcel_id: "ip-0", order_id: "a", linked_by: null, created_at: "" }]);
    const out = await addOrdersStoreTracking(operator, { order_ids: ["a"], tracking_numbers: ["1Z999AA10123456784"] });
    expect(out.added).toEqual(["a"]);
    expect(notifyCustomer).not.toHaveBeenCalled();
  });

  it("says nothing once the parcel is already at the hub", async () => {
    vi.mocked(listWarehouseItemsByIds).mockResolvedValue([item("a", { received: { at: "", weight_lbs: 1, location: null } })]);
    await addOrdersStoreTracking(operator, { order_ids: ["a"], tracking_numbers: ["1Z999AA10123456784"] });
    expect(notifyCustomer).not.toHaveBeenCalled();
  });

  it("refuses unbought orders and bad numbers by name, and keeps the rest", async () => {
    vi.mocked(listWarehouseItemsByIds).mockResolvedValue([item("a", { order_status: "paid" }), item("b")]);
    vi.mocked(registerInboundTracking).mockRejectedValueOnce(new Error("That does not look like a tracking number."));
    const out = await addOrdersStoreTracking(operator, { order_ids: ["a", "b"], tracking_numbers: ["123"] });
    expect(out.added).toEqual([]);
    expect(out.refused.map((r) => r.order_no)).toEqual(["TM-a", "TM-b"]);
    expect(out.refused[0]!.reason).toMatch(/Mark it purchased/);
    expect(out.refused[1]!.input).toBe("123");
  });
});
