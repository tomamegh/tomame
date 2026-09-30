import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/db/queries/rate-limits", () => ({ hitRateLimit: vi.fn() }));

import { checkRateLimit, getClientIp, rateLimitSubject } from "@/lib/rate-limit";
import { hitRateLimit } from "@/db/queries/rate-limits";
import { logger } from "@/lib/logger";

const CONFIG = { windowMs: 15 * 60 * 1000, maxRequests: 60 };
const req = (headers: Record<string, string>) => new Request("https://tomame.test/x", { headers });

beforeEach(() => vi.clearAllMocks());

describe("checkRateLimit (Postgres-backed)", () => {
  it("counts in Postgres with the limit and the window in seconds", async () => {
    vi.mocked(hitRateLimit).mockResolvedValue({ allowed: true, remaining: 59, resetAt: 1 });
    const result = await checkRateLimit("login:ip:1.2.3.4", CONFIG);
    expect(hitRateLimit).toHaveBeenCalledWith("login:ip:1.2.3.4", 60, 900);
    expect(result).toEqual({ allowed: true, remaining: 59, resetAt: 1 });
  });

  it("passes a refusal straight through", async () => {
    vi.mocked(hitRateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetAt: 2 });
    expect((await checkRateLimit("k", CONFIG)).allowed).toBe(false);
  });

  it("fails OPEN and warns when the database call errors, so a blip locks nobody out", async () => {
    vi.mocked(hitRateLimit).mockRejectedValue(new Error("connection refused"));
    const result = await checkRateLimit("login:ip:1.2.3.4", CONFIG);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(60);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    // Only the bucket name is logged, never the IP or user id in the key.
    expect(vi.mocked(logger.warn).mock.calls[0]?.[1]).toMatchObject({ key: "login" });
  });
});

describe("getClientIp", () => {
  it("takes the FIRST x-forwarded-for hop, not the whole header", () => {
    expect(getClientIp(req({ "x-forwarded-for": "41.66.1.2, 10.0.0.1, 76.76.21.21" }))).toBe("41.66.1.2");
  });
  it("falls back to x-real-ip, then to 'unknown'", () => {
    expect(getClientIp(req({ "x-real-ip": "41.66.9.9" }))).toBe("41.66.9.9");
    expect(getClientIp(req({}))).toBe("unknown");
    expect(getClientIp(req({ "x-forwarded-for": " , 1.1.1.1" }))).toBe("unknown");
  });
});

describe("rateLimitSubject", () => {
  it("keys a signed-in caller by user id so a carrier NAT does not share one bucket", () => {
    expect(rateLimitSubject(req({ "x-forwarded-for": "41.66.1.2" }), "u1")).toBe("user:u1");
  });
  it("keys a visitor by IP, never by a client-controlled cookie", () => {
    expect(rateLimitSubject(req({ "x-forwarded-for": "41.66.1.2", cookie: "tm_quote_session=abc" }), null)).toBe(
      "ip:41.66.1.2",
    );
  });
});
