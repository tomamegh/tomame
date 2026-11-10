import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/queries/warehouse", () => ({ getShippedPackageForOrder: vi.fn(), updatePackage: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));

import { getShippedPackageForOrder, updatePackage, type PackageRow } from "@/db/queries/warehouse";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { closePackageIfAllDelivered } from "../services/package-close.service";

const pkg = (over: Partial<PackageRow> = {}) =>
  ({ id: "p1", reference: "PKG-10003", status: "shipped", stage: "ghana_warehouse", ...over }) as PackageRow;
const customer = { id: "u1", role: "user" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updatePackage).mockImplementation(async (_id, _s, patch) => pkg(patch));
});

describe("closePackageIfAllDelivered", () => {
  it("delivers the package when its last order is delivered, and audits who did it", async () => {
    vi.mocked(getShippedPackageForOrder).mockResolvedValue({ pkg: pkg(), orderStatuses: ["delivered", "completed"] });
    await closePackageIfAllDelivered("o1", customer);
    expect(updatePackage).toHaveBeenCalledWith("p1", "shipped", expect.objectContaining({ stage: "delivered", stage_by: "u1", notice: null }));
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actorRole: "user", action: "shipment_stage_moved", metadata: expect.objectContaining({ reason: "all_orders_delivered" }) }),
    );
  });

  it("leaves it while another order inside is still on its way", async () => {
    vi.mocked(getShippedPackageForOrder).mockResolvedValue({ pkg: pkg(), orderStatuses: ["delivered", "in_transit"] });
    await closePackageIfAllDelivered("o1", customer);
    expect(updatePackage).not.toHaveBeenCalled();
  });

  it("does nothing for a loose order or a package already delivered", async () => {
    vi.mocked(getShippedPackageForOrder).mockResolvedValue(null);
    await closePackageIfAllDelivered("o1", customer);
    vi.mocked(getShippedPackageForOrder).mockResolvedValue({ pkg: pkg({ stage: "delivered" }), orderStatuses: ["delivered"] });
    await closePackageIfAllDelivered("o1", customer);
    expect(updatePackage).not.toHaveBeenCalled();
  });

  it("never throws: the delivery it follows is already committed", async () => {
    vi.mocked(getShippedPackageForOrder).mockRejectedValue(new Error("db down"));
    await expect(closePackageIfAllDelivered("o1", customer)).resolves.toBeUndefined();
  });
});
