import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/features/auth/services/auth.service", () => ({ getAuthenticatedUser: vi.fn(async () => null) }));
vi.mock("@/db/queries/extraction-cache", () => ({ getValidExtractionById: vi.fn() }));
vi.mock("@/features/quotes/services/quote-lock.service", () => ({
  applyRateLock: vi.fn(),
  withDeliveryEta: vi.fn(async (pricing: unknown) => pricing),
}));
vi.mock("@/features/pricing/services/pricing.service", () => ({ calculatePricing: vi.fn(async () => ({ total_ghs: 100 })) }));
vi.mock("@/features/extraction/quote.service", () => ({ gapFillOverrides: vi.fn(() => null) }));
vi.mock("@/lib/quote-session", () => ({ resolveViewer: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: () => "1.2.3.4",
}));

import { calculatePricing } from "@/features/pricing/services/pricing.service";
import { GET } from "../route";

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/pricing/preview?${qs}`));

beforeEach(() => vi.clearAllMocks());

describe("GET /api/pricing/preview — manual estimate store shipping", () => {
  it("passes a per-unit USD figure to the calculator", async () => {
    const res = await get("itemPriceUsd=50&quantity=2&storeShippingUsd=6.5");
    expect(res.status).toBe(200);
    expect(calculatePricing).toHaveBeenCalledWith(
      expect.objectContaining({ itemPriceUsd: 50, quantity: 2, storeShipping: 6.5, storeShippingCurrency: "USD" }),
      null,
    );
  });

  it("prices none when the client sends none", async () => {
    await get("itemPriceUsd=50");
    expect(calculatePricing).toHaveBeenCalledWith(expect.objectContaining({ storeShipping: null }), null);
  });

  it("refuses a negative or absurd figure", async () => {
    expect((await get("itemPriceUsd=50&storeShippingUsd=-1")).status).toBe(400);
    expect((await get("itemPriceUsd=50&storeShippingUsd=999999")).status).toBe(400);
    expect(calculatePricing).not.toHaveBeenCalled();
  });
});
