import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/db/queries/delivery-zones", () => ({ listActiveDeliveryZones: vi.fn() }));
vi.mock("@/db/queries/delivery-addresses", () => ({
  listDeliveryAddresses: vi.fn(),
  getDeliveryAddressById: vi.fn(),
  insertDeliveryAddress: vi.fn(),
  updateDeliveryAddress: vi.fn(),
  deleteDeliveryAddress: vi.fn(async () => true),
  clearDefaultAddress: vi.fn(async () => undefined),
}));

import * as q from "@/db/queries/delivery-addresses";
import { listActiveDeliveryZones } from "@/db/queries/delivery-zones";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import { createAddress, deleteAddress, updateAddress } from "../services/addresses.service";
import type { DeliveryAddress } from "../types";

const DOOR = "b4c99974-a1b4-4b49-ac8f-42dd0a0626d8";
const PICKUP = "c5d99974-a1b4-4b49-ac8f-42dd0a0626d9";
const input = { label: "Home", recipient_name: "Ama", phone: "0245550192", line1: "12 Rd", city: "Accra", delivery_zone_id: DOOR, is_default: false };
const addr = (over: Partial<DeliveryAddress> = {}): DeliveryAddress => ({
  id: "a1", user_id: "u1", label: "Home", kind: "door", recipient_name: "Ama", phone: "0245550192", line1: "12 Rd", line2: null,
  area: null, city: "Accra", region: null, delivery_zone_id: DOOR, digital_address: null, is_default: false,
  created_at: "2026-09-01T00:00:00Z", updated_at: "", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listActiveDeliveryZones).mockResolvedValue([
    { id: DOOR, name: "Accra", kind: "door", fee_ghs: 30, extra_days: 0, note: null, sort_order: 1 },
    { id: PICKUP, name: "Hub", kind: "pickup", fee_ghs: 0, extra_days: 0, note: null, sort_order: 2 },
  ]);
  vi.mocked(q.insertDeliveryAddress).mockImplementation(async (_u, i) => addr({ id: "new", is_default: i.is_default }));
  vi.mocked(q.updateDeliveryAddress).mockImplementation(async (id, p) => addr({ id, ...p }));
});

describe("createAddress", () => {
  it("makes the first address the default even when not asked", async () => {
    vi.mocked(q.listDeliveryAddresses).mockResolvedValue([]);
    const row = await createAddress("u1", input);
    expect(row.is_default).toBe(true);
    expect(q.insertDeliveryAddress).toHaveBeenCalledWith("u1", expect.objectContaining({ is_default: true }));
    expect(q.clearDefaultAddress).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "address_created", entityType: "delivery_address", actorRole: "user" }));
  });

  it("leaves a later address non-default unless asked, and clears the previous default when asked", async () => {
    vi.mocked(q.listDeliveryAddresses).mockResolvedValue([addr({ is_default: true })]);
    expect((await createAddress("u1", input)).is_default).toBe(false);
    expect(q.clearDefaultAddress).not.toHaveBeenCalled();

    await createAddress("u1", { ...input, is_default: true });
    expect(q.clearDefaultAddress).toHaveBeenCalledWith("u1");
    const clearedAt = vi.mocked(q.clearDefaultAddress).mock.invocationCallOrder[0] ?? Infinity;
    const insertedAt = vi.mocked(q.insertDeliveryAddress).mock.invocationCallOrder[1] ?? -Infinity;
    expect(clearedAt).toBeLessThan(insertedAt);
  });

  it("rejects a zone we do not serve at the door", async () => {
    vi.mocked(q.listDeliveryAddresses).mockResolvedValue([]);
    await expect(createAddress("u1", { ...input, delivery_zone_id: PICKUP })).rejects.toMatchObject({ statusCode: 400, message: "Choose a delivery zone we serve" });
    await expect(createAddress("u1", { ...input, delivery_zone_id: "d6d99974-a1b4-4b49-ac8f-42dd0a0626d0" })).rejects.toBeInstanceOf(APIError);
    expect(q.insertDeliveryAddress).not.toHaveBeenCalled();
  });
});

describe("updateAddress", () => {
  it("clears the previous default before setting a new one", async () => {
    vi.mocked(q.getDeliveryAddressById).mockResolvedValue(addr({ id: "a2" }));
    const row = await updateAddress("u1", "a2", { is_default: true });
    expect(q.clearDefaultAddress).toHaveBeenCalledWith("u1");
    expect(row.is_default).toBe(true);
  });

  it("is a 404 for someone else's address", async () => {
    vi.mocked(q.getDeliveryAddressById).mockResolvedValue(addr({ user_id: "u2" }));
    await expect(updateAddress("u1", "a1", { label: "Work" })).rejects.toMatchObject({ statusCode: 404, message: "Address not found" });
    expect(q.updateDeliveryAddress).not.toHaveBeenCalled();
  });

  it("does not let the only default be unset", async () => {
    vi.mocked(q.getDeliveryAddressById).mockResolvedValue(addr({ is_default: true }));
    await updateAddress("u1", "a1", { is_default: false, label: "Work" });
    expect(q.updateDeliveryAddress).toHaveBeenCalledWith("a1", { label: "Work" });
  });
});

describe("deleteAddress", () => {
  it("promotes the oldest remaining address when the default goes", async () => {
    vi.mocked(q.getDeliveryAddressById).mockResolvedValue(addr({ id: "a1", is_default: true }));
    vi.mocked(q.listDeliveryAddresses).mockResolvedValue([
      addr({ id: "a3", created_at: "2026-09-03T00:00:00Z" }),
      addr({ id: "a2", created_at: "2026-09-02T00:00:00Z" }),
    ]);
    await deleteAddress("u1", "a1");
    expect(q.deleteDeliveryAddress).toHaveBeenCalledWith("a1");
    expect(q.updateDeliveryAddress).toHaveBeenCalledWith("a2", { is_default: true });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "address_deleted", metadata: { promoted_default: "a2" } }));
  });

  it("promotes nothing when a non-default goes, and 404s on a foreign row", async () => {
    vi.mocked(q.getDeliveryAddressById).mockResolvedValue(addr({ id: "a2" }));
    await deleteAddress("u1", "a2");
    expect(q.updateDeliveryAddress).not.toHaveBeenCalled();

    vi.mocked(q.getDeliveryAddressById).mockResolvedValue(addr({ user_id: "u2" }));
    await expect(deleteAddress("u1", "a1")).rejects.toMatchObject({ statusCode: 404 });
  });
});
