import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/db/queries/warehouse-activity", () => ({ insertWarehouseActivity: vi.fn() }));

import * as q from "@/db/queries/warehouse-activity";
import { pageViewSchema } from "@/features/warehouse/activity-schema";
import { cleanPath, pageSubject, recordWarehouseActivity } from "@/features/warehouse/services/activity.service";
import type { PlatformUser } from "@/features/users/types";

const user = (role: string) =>
  ({ id: "0cc86b58-ba66-4922-875e-8066bfdb0ada", app_metadata: { role }, profile: { role } }) as unknown as PlatformUser;

describe("recordWarehouseActivity", () => {
  beforeEach(() => vi.mocked(q.insertWarehouseActivity).mockReset());

  it("records the session's own account and role, never a caller's", async () => {
    await recordWarehouseActivity(user("warehouse"), { kind: "page_view", path: "/warehouse/scan?q=secret#x" });
    expect(q.insertWarehouseActivity).toHaveBeenCalledWith({
      kind: "page_view",
      path: "/warehouse/scan",
      actor_id: "0cc86b58-ba66-4922-875e-8066bfdb0ada",
      actor_role: "warehouse",
    });
  });

  it("audits an admin as an admin", async () => {
    await recordWarehouseActivity(user("admin"), { kind: "scan" });
    expect(vi.mocked(q.insertWarehouseActivity).mock.calls[0]?.[0].actor_role).toBe("admin");
  });

  it("records nothing for a customer", async () => {
    await recordWarehouseActivity(user("user"), { kind: "page_view", path: "/warehouse" });
    expect(q.insertWarehouseActivity).not.toHaveBeenCalled();
  });

  it("never throws into the request", async () => {
    vi.mocked(q.insertWarehouseActivity).mockImplementationOnce(async () => {
      throw new Error("db down");
    });
    await expect(recordWarehouseActivity(user("warehouse"), { kind: "scan" })).resolves.toBeUndefined();
  });
});

describe("the beacon's body", () => {
  it("accepts warehouse pathnames only", () => {
    expect(pageViewSchema.safeParse({ path: "/warehouse" }).success).toBe(true);
    expect(pageViewSchema.safeParse({ path: "/warehouse/packages/76b3c3b1-d323-43db-87c2-919e3c57fa6f" }).success).toBe(true);
    expect(pageViewSchema.safeParse({ path: "/admin/users" }).success).toBe(false);
    expect(pageViewSchema.safeParse({ path: "/warehouse?q=x" }).success).toBe(false);
    expect(pageViewSchema.safeParse({ path: "/warehousey" }).success).toBe(false);
    expect(pageViewSchema.safeParse({ path: `/warehouse/${"a".repeat(400)}` }).success).toBe(false);
  });

  it("cleanPath strips queries and caps length", () => {
    expect(cleanPath("/warehouse/scan?code=1")).toBe("/warehouse/scan");
    expect(cleanPath("")).toBeNull();
    expect(cleanPath(`/warehouse/${"a".repeat(400)}`)?.length).toBe(300);
  });
});

describe("pageSubject", () => {
  it("attaches the package or item a page is about", () => {
    expect(pageSubject("/warehouse/packages/76B3C3B1-d323-43db-87c2-919e3c57fa6f")).toEqual({
      subject_type: "warehouse_package",
      subject_id: "76b3c3b1-d323-43db-87c2-919e3c57fa6f",
    });
    expect(pageSubject("/warehouse/items/df5ec16a-f3c1-4b2b-8a18-53eb54f8ab28")).toEqual({
      subject_type: "order",
      subject_id: "df5ec16a-f3c1-4b2b-8a18-53eb54f8ab28",
    });
    expect(pageSubject("/warehouse/packages")).toEqual({});
    expect(pageSubject("/warehouse/packages/not-a-uuid")).toEqual({});
  });
});
