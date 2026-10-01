import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/services/auth.service", () => ({
  getAuthenticatedUser: vi.fn(),
}));
vi.mock("@/features/audit/services/audit.service", () => ({
  logAuditEvent: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/db/queries/fixed-freight-items", () => ({
  getActiveFixedFreightItems: vi.fn(),
  getFixedFreightItemById: vi.fn(),
  insertFixedFreightItem: vi.fn(),
  listAllFixedFreightItems: vi.fn(),
  updateFixedFreightItem: vi.fn(),
}));

import {
  getActiveFixedFreightItems,
  getFixedFreightItemById,
  insertFixedFreightItem,
  listAllFixedFreightItems,
  updateFixedFreightItem,
} from "@/db/queries/fixed-freight-items";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { PATCH } from "../[id]/route";
import { POST as MATCH } from "../match/route";
import { GET, POST } from "../route";

const ID = "5f0c7c1e-8a52-4d3e-9d7e-2b1a6c9e0f11";
const admin = { id: "admin-1", app_metadata: { role: "admin" } };
const customer = { id: "user-1", app_metadata: {} };
const row = {
  id: ID,
  category: "IPHONE",
  product_name: "iPhone 13 & Mini",
  freight_rate_ghs: 500,
  keywords: ["iphone 13", "iphone 13 mini"],
  sort_order: 10,
  is_active: true,
  updated_at: "2026-09-30T00:00:00Z",
};

const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api/admin/fixed-freight-items", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never;
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedUser).mockResolvedValue(admin as never);
});

describe("auth", () => {
  it("401s a signed-out caller and 403s a non-admin on every route, touching nothing", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect((await GET(req("GET"))).status).toBe(401);

    vi.mocked(getAuthenticatedUser).mockResolvedValue(customer as never);
    expect((await GET(req("GET"))).status).toBe(403);
    expect((await POST(req("POST", { ...row }))).status).toBe(403);
    expect(
      (await PATCH(req("PATCH", { freight_rate_ghs: 1 }), ctx())).status,
    ).toBe(403);
    expect((await MATCH(req("POST", { title: "iPhone 13" }))).status).toBe(403);

    expect(listAllFixedFreightItems).not.toHaveBeenCalled();
    expect(insertFixedFreightItem).not.toHaveBeenCalled();
    expect(updateFixedFreightItem).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe("GET", () => {
  it("returns every row", async () => {
    vi.mocked(listAllFixedFreightItems).mockResolvedValue([row]);
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.items).toEqual([row]);
  });
});

describe("POST", () => {
  it("creates a normalised row and audits it", async () => {
    vi.mocked(insertFixedFreightItem).mockResolvedValue(row);
    const res = await POST(
      req("POST", {
        category: "iphone",
        product_name: " iPhone 13 & Mini ",
        freight_rate_ghs: 500,
        keywords: ["iPhone 13", "iphone 13 mini"],
        sort_order: 10,
      }),
    );
    expect(res.status).toBe(201);
    expect(insertFixedFreightItem).toHaveBeenCalledWith({
      category: "IPHONE",
      product_name: "iPhone 13 & Mini",
      freight_rate_ghs: 500,
      keywords: ["iphone 13", "iphone 13 mini"],
      sort_order: 10,
      is_active: true,
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        actorRole: "admin",
        action: "fixed_freight_item_created",
        entityType: "fixed_freight_item",
        entityId: ID,
        metadata: expect.objectContaining({ before: null }),
      }),
    );
  });

  it("400s a bad body without writing", async () => {
    expect(
      (await POST(req("POST", { ...row, freight_rate_ghs: 0 }))).status,
    ).toBe(400);
    expect(insertFixedFreightItem).not.toHaveBeenCalled();
  });
});

describe("PATCH", () => {
  it("updates only the given field and audits before and after", async () => {
    vi.mocked(getFixedFreightItemById).mockResolvedValue(row);
    vi.mocked(updateFixedFreightItem).mockResolvedValue({
      ...row,
      freight_rate_ghs: 550,
    });

    const res = await PATCH(req("PATCH", { freight_rate_ghs: 550 }), ctx());
    expect(res.status).toBe(200);
    expect(updateFixedFreightItem).toHaveBeenCalledWith(
      ID,
      { freight_rate_ghs: 550 },
      row.updated_at,
    );
    const entry = vi.mocked(logAuditEvent).mock.calls[0]![0];
    expect(entry).toMatchObject({
      action: "fixed_freight_item_updated",
      entityType: "fixed_freight_item",
      entityId: ID,
      metadata: {
        changes: { freight_rate_ghs: 550 },
        before: { freight_rate_ghs: 500 },
        after: { freight_rate_ghs: 550 },
      },
    });
  });

  it("404s an unknown id and a non-uuid id, without writing or auditing", async () => {
    vi.mocked(getFixedFreightItemById).mockResolvedValue(null);
    expect(
      (await PATCH(req("PATCH", { freight_rate_ghs: 550 }), ctx())).status,
    ).toBe(404);
    expect(
      (await PATCH(req("PATCH", { freight_rate_ghs: 550 }), ctx("nope")))
        .status,
    ).toBe(404);
    expect(updateFixedFreightItem).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("400s an empty patch", async () => {
    expect((await PATCH(req("PATCH", {}), ctx())).status).toBe(400);
    expect(
      (await PATCH(req("PATCH", { expected_updated_at: row.updated_at }), ctx()))
        .status,
    ).toBe(400);
  });

  it("409s without auditing when the row changed between the read and the write", async () => {
    vi.mocked(getFixedFreightItemById).mockResolvedValue(row);
    vi.mocked(updateFixedFreightItem).mockResolvedValue(null);

    const res = await PATCH(req("PATCH", { freight_rate_ghs: 550 }), ctx());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Someone else just changed this item/);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("409s without writing when the admin's loaded copy is stale", async () => {
    vi.mocked(getFixedFreightItemById).mockResolvedValue({
      ...row,
      updated_at: "2026-09-30T00:05:00Z",
    });

    const res = await PATCH(
      req("PATCH", { freight_rate_ghs: 550, expected_updated_at: row.updated_at }),
      ctx(),
    );

    expect(res.status).toBe(409);
    expect(updateFixedFreightItem).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("accepts the loaded stamp in another spelling of the same instant, and never writes it as a field", async () => {
    vi.mocked(getFixedFreightItemById).mockResolvedValue({
      ...row,
      updated_at: "2026-09-30T00:00:00.123456+00:00",
    });
    vi.mocked(updateFixedFreightItem).mockResolvedValue({ ...row, freight_rate_ghs: 550 });

    const res = await PATCH(
      req("PATCH", { freight_rate_ghs: 550, expected_updated_at: "2026-09-30T00:00:00.123456Z" }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(updateFixedFreightItem).toHaveBeenCalledWith(
      ID,
      { freight_rate_ghs: 550 },
      "2026-09-30T00:00:00.123456+00:00",
    );
  });

  it("404s when the row vanished between the read and the write", async () => {
    vi.mocked(getFixedFreightItemById).mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    vi.mocked(updateFixedFreightItem).mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { freight_rate_ghs: 550 }), ctx())).status).toBe(404);
  });
});

describe("POST /match", () => {
  const pro = {
    ...row,
    id: "p",
    product_name: "iPhone 13 Pro & Max",
    freight_rate_ghs: 850,
    keywords: ["iphone 13 pro", "iphone 13 pro max"],
  };

  it("uses the real matcher: the longest keyword wins", async () => {
    vi.mocked(getActiveFixedFreightItems).mockResolvedValue([row, pro]);
    const res = await MATCH(
      req("POST", { title: "Apple iPhone 13 Pro Max 256GB" }),
    );
    const { data } = await res.json();
    expect(data.match).toMatchObject({
      product_name: "iPhone 13 Pro & Max",
      freight_rate_ghs: 850,
      keyword: "iphone 13 pro max",
    });
  });

  it("respects the category gate and reports what it skipped", async () => {
    vi.mocked(getActiveFixedFreightItems).mockResolvedValue([row]);
    const { data } = await (
      await MATCH(
        req("POST", { title: "iPhone 13 hoodie", category: "Men's Clothing" }),
      )
    ).json();
    expect(data).toEqual({ match: null, gated_out: 1 });
  });
});
