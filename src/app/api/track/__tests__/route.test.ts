import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/services/auth.service", () => ({ getAuthenticatedUser: vi.fn(async () => null) }));
vi.mock("@/db/queries/public-tracking", () => ({
  getTrackingOrderByNo: vi.fn(async () => null),
  getOrderPhones: vi.fn(async () => []),
  getOrderOwnerEmail: vi.fn(async () => null),
  listTrackingEvents: vi.fn(async () => []),
}));
vi.mock("@/features/tracking/services/public-tracking.service", () => ({
  lookupPublicTracking: vi.fn(async () => ({ found: false })),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: (r: Request) => r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
  rateLimitSubject: (r: Request, userId?: string | null) =>
    userId ? `user:${userId}` : `ip:${r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"}`,
}));

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { lookupPublicTracking } from "@/features/tracking/services/public-tracking.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { POST } from "../route";

function post(body: unknown) {
  return new Request("http://localhost/api/track", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as never);
  vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
});

describe("POST /api/track", () => {
  it("is open without a session and answers a miss with 200 { found: false }", async () => {
    const res = await POST(post({ q: "TM-99999" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { found: false } });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(lookupPublicTracking).toHaveBeenCalledWith(expect.objectContaining({ query: "TM-99999", verifier: null, viewerId: null }));
  });

  it("rate-limits by IP before reading anything", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false } as never);
    const res = await POST(post({ q: "TM-00001" }));
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("track:ip:203.0.113.9", expect.objectContaining({ maxRequests: 30 }));
    expect(lookupPublicTracking).not.toHaveBeenCalled();
  });

  it("rate-limits a signed-in caller by their account, not the shared IP", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "u-1" } as never);
    await POST(post({ q: "TM-00001" }));
    expect(checkRateLimit).toHaveBeenCalledWith("track:user:u-1", expect.any(Object));
    expect(lookupPublicTracking).toHaveBeenCalledWith(expect.objectContaining({ ip: "203.0.113.9" }));
  });

  it("answers a failed session read as our error, not as an anonymous lookup", async () => {
    vi.mocked(getAuthenticatedUser).mockRejectedValue(new Error("auth down"));
    const res = await POST(post({ q: "TM-00001", verify: "0192" }));
    expect(res.status).toBe(500);
    expect(lookupPublicTracking).not.toHaveBeenCalled();
  });

  it("passes the signed-in viewer so an owner sees their own order", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: "u-1" } as never);
    await POST(post({ q: "TM-00001", verify: "0192" }));
    expect(lookupPublicTracking).toHaveBeenCalledWith(expect.objectContaining({ query: "TM-00001", verifier: "0192", viewerId: "u-1" }));
  });

  it("answers a carrier number with the same 200 { found: false } (carrier numbers are internal)", async () => {
    const { lookupPublicTracking: real } = await vi.importActual<
      typeof import("@/features/tracking/services/public-tracking.service")
    >("@/features/tracking/services/public-tracking.service");
    vi.mocked(lookupPublicTracking).mockImplementationOnce(real);
    const res = await POST(post({ q: "1Z 999 AA1 0123 4567 84" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { found: false } });
  });

  it("400s a body that is not a lookup", async () => {
    expect((await POST(post({ q: 42 }))).status).toBe(400);
  });
});
