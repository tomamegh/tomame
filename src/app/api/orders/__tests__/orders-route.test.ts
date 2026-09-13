import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/auth/services/auth.service", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/features/orders/services/orders.service", () => ({
  createOrder: vi.fn(),
  listUserOrders: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));
// The rate lock is resolved from the session cookie, which needs a real request
// context this test has no business standing up.
vi.mock("@/lib/quote-session", () => ({
  resolveViewer: vi.fn(() => ({ viewer: { userId: "u1", sessionId: null } })),
}));

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { createOrder, listUserOrders } from "@/features/orders/services/orders.service";
import { checkRateLimit } from "@/lib/rate-limit";
import type { PlatformUser } from "@/features/users/types";
import { GET, POST } from "../route";

/**
 * `POST /api/orders/new` was a byte-for-byte duplicate of `POST /api/orders`
 * (data map §"Existing defects" 4) and `GET /api/orders` threw its envelope
 * away. Both are standing debt this phase collapsed, and both are the kind of
 * thing that quietly comes back.
 */

const user = { id: "u1", email: "k@example.com", profile: { role: "user" } } as unknown as PlatformUser;

const order = { id: "o1", order_no: "TM-00001" };

function request(body?: unknown): Request {
  return new Request("http://localhost/api/orders", {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedUser).mockResolvedValue(user);
  vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as never);
});

describe("the duplicate route is gone", () => {
  it("has no `/api/orders/new` handler left to drift from this one", () => {
    expect(existsSync(join(process.cwd(), "src/app/api/orders/new/route.ts"))).toBe(false);
  });
});

describe("GET /api/orders", () => {
  it("answers with the SERVICE'S envelope, count included", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({ orders: [order] as never, count: 1 });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // Not a bare array: the Journeys filter pills are counts over this list.
    expect(body).toEqual({ success: true, data: { orders: [order], count: 1 } });
  });

  it("reports zero orders as an envelope, not as an empty body", async () => {
    vi.mocked(listUserOrders).mockResolvedValue({ orders: [], count: 0 });

    const body = await (await GET()).json();
    expect(body.data).toEqual({ orders: [], count: 0 });
  });

  it("401s a signed-out caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
    expect(listUserOrders).not.toHaveBeenCalled();
  });
});

describe("POST /api/orders", () => {
  const valid = {
    product_url: "https://www.amazon.com/dp/B09XS7JWHH",
    product_name: "Sony WH-1000XM5",
    quantity: 1,
  };

  it("creates the order and answers 201", async () => {
    vi.mocked(createOrder).mockResolvedValue(order as never);

    const res = await POST(request(valid) as never);
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual(order);
  });

  it("rejects a body that fails the schema before touching the service", async () => {
    const res = await POST(request({ quantity: 1, product_name: "x" }) as never);
    expect(res.status).toBe(400);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON with 400, not a 500", async () => {
    const bad = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect((await POST(bad as never)).status).toBe(400);
  });

  it("401s a signed-out caller without creating anything", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    const res = await POST(request(valid) as never);
    expect(res.status).toBe(401);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("is rate limited on its own key", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false } as never);

    const res = await POST(request(valid) as never);
    expect(res.status).toBe(429);
    expect(vi.mocked(checkRateLimit).mock.calls[0]?.[0]).toMatch(/^orders-create:/);
    expect(createOrder).not.toHaveBeenCalled();
  });
});
