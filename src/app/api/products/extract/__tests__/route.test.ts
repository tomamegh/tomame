import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/features/auth/services/auth.service", () => ({ getAuthenticatedUser: vi.fn(async () => null) }));
vi.mock("@/db/queries/extraction-cache", () => ({ getCachedExtractionByHash: vi.fn() }));
vi.mock("@/features/extraction/extraction.service", () => ({
  prepareProductUrl: vi.fn(async (url: string) => ({
    canonicalUrl: url,
    urlHash: "hash-1",
    platform: "generic",
    store: { slug: "generic" },
    region: null,
  })),
  extractPrepared: vi.fn(async () => ({
    extraction_cache_id: "cache-1",
    title: "A product",
    enrich: undefined,
  })),
}));
vi.mock("@/features/quotes/services/quote-lock.service", () => ({
  quoteForViewer: vi.fn(async (extraction: unknown) => ({ ...(extraction as object), pricing: { total_ghs: 100 } })),
}));
vi.mock("@/lib/quote-session", () => ({
  resolveViewer: vi.fn(() => ({
    viewer: { userId: null, sessionId: "minted-session" },
    finalize: (response: Response) => response,
  })),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));

import { getCachedExtractionByHash } from "@/db/queries/extraction-cache";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { POST } from "../route";

/**
 * W3 (SECURITY-REVIEW-2026-09-14): a cache hit calls no vendor, but it still
 * mints a session/lock/audit row for a cookie-less caller. Before this fix
 * `checkRateLimit` was never called at all on that path — these tests pin the
 * two buckets in place so a regression that removes the cache-hit check (or
 * folds it back into the vendor-call bucket) fails loudly.
 */

function request(ip = "1.2.3.4"): Request {
  return new Request("http://localhost/api/products/extract", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ product_url: "https://example.com/product/1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, remaining: 1, resetAt: Date.now() } as never);
});

describe("POST /api/products/extract — rate limiting", () => {
  it("on a cache MISS, rate-limits the vendor-cost bucket keyed by IP", async () => {
    vi.mocked(getCachedExtractionByHash).mockResolvedValue(null);

    const res = await POST(request("9.9.9.9") as never);

    expect(res.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledWith("extraction:9.9.9.9", RATE_LIMIT.extraction);
    expect(checkRateLimit).not.toHaveBeenCalledWith("extraction:cache:9.9.9.9", expect.anything());
  });

  it("on a cache MISS, 429s once the vendor-cost bucket is exhausted", async () => {
    vi.mocked(getCachedExtractionByHash).mockResolvedValue(null);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() } as never);

    const res = await POST(request() as never);
    expect(res.status).toBe(429);
  });

  it("on a cache HIT, checks a SEPARATE, looser bucket rather than skipping the check", async () => {
    vi.mocked(getCachedExtractionByHash).mockResolvedValue({
      id: "cache-1",
      result: { title: "cached product" },
    } as never);

    const res = await POST(request("5.5.5.5") as never);

    expect(res.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    const [key, config] = vi.mocked(checkRateLimit).mock.calls[0]!;
    expect(key).toBe("extraction:cache:5.5.5.5");
    // Looser than the vendor bucket, same window — derived from RATE_LIMIT.extraction,
    // not a brand new constant.
    expect((config as { windowMs: number }).windowMs).toBe(RATE_LIMIT.extraction.windowMs);
    expect((config as { maxRequests: number }).maxRequests).toBeGreaterThan(RATE_LIMIT.extraction.maxRequests);
  });

  it("on a cache HIT, 429s once its own bucket is exhausted — cache hits are bounded, not free", async () => {
    vi.mocked(getCachedExtractionByHash).mockResolvedValue({
      id: "cache-1",
      result: { title: "cached product" },
    } as never);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() } as never);

    const res = await POST(request() as never);
    expect(res.status).toBe(429);
  });

  it("a cache HIT never consumes the vendor-cost bucket key", async () => {
    vi.mocked(getCachedExtractionByHash).mockResolvedValue({
      id: "cache-1",
      result: { title: "cached product" },
    } as never);

    await POST(request("7.7.7.7") as never);

    expect(checkRateLimit).not.toHaveBeenCalledWith("extraction:7.7.7.7", RATE_LIMIT.extraction);
  });
});
