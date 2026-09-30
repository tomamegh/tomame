import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/services/auth.service", () => ({
  getUserSession: vi.fn(),
  canAccessAdmin: (s: { app_metadata?: { role?: string } } | null) => s?.app_metadata?.role === "admin",
}));
vi.mock("@/features/order-delivery/services/courier.service", () => ({ dispatchOrderCourier: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));

import { getUserSession } from "@/features/auth/services/auth.service";
import { dispatchOrderCourier } from "@/features/order-delivery/services/courier.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { POST } from "../route";

const adminSession = { app_metadata: { role: "admin" } };
const adminUser = { id: "admin-1" };
const params = { params: Promise.resolve({ id: "o1" }) };

function post(body: unknown) {
  return new Request("http://localhost/api/admin/orders/o1/courier", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as never);
  vi.mocked(getUserSession).mockResolvedValue({ session: adminSession, user: adminUser } as never);
  vi.mocked(dispatchOrderCourier).mockResolvedValue({ action: "order_courier_dispatched" } as never);
});

describe("POST /api/admin/orders/:id/courier", () => {
  it("403s a caller without the admin claim", async () => {
    vi.mocked(getUserSession).mockResolvedValue({ session: { app_metadata: {} }, user: adminUser } as never);
    const res = await POST(post({ courier_phone: "0244123456" }), params);
    expect(res.status).toBe(403);
    expect(dispatchOrderCourier).not.toHaveBeenCalled();
  });

  it("403s a signed-out caller", async () => {
    vi.mocked(getUserSession).mockResolvedValue({ session: null, user: null } as never);
    expect((await POST(post({ courier_phone: "0244123456" }), params)).status).toBe(403);
  });

  it("429s when rate limited, before touching the session", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false } as never);
    expect((await POST(post({ courier_phone: "0244123456" }), params)).status).toBe(429);
    expect(getUserSession).not.toHaveBeenCalled();
  });

  it("400s invalid JSON, a bad phone and a javascript: link", async () => {
    expect((await POST(post("{nope"), params)).status).toBe(400);
    expect((await POST(post({ courier_phone: "123" }), params)).status).toBe(400);
    expect((await POST(post({ tracking_url: "javascript:alert(1)" }), params)).status).toBe(400);
    expect(dispatchOrderCourier).not.toHaveBeenCalled();
  });

  it("hands the service the normalised input and the order id", async () => {
    const res = await POST(
      post({ courier_name: "Kofi", courier_phone: "+233 24 412 3456", tracking_url: "https://t.uber.com/x" }),
      params,
    );
    expect(res.status).toBe(200);
    expect(dispatchOrderCourier).toHaveBeenCalledWith(adminUser, "o1", {
      courier_name: "Kofi",
      courier_phone: "+233244123456",
      tracking_url: "https://t.uber.com/x",
      provider: "uber",
    });
  });
});
