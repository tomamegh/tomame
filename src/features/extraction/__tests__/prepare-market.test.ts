import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "PAYSTACK_SECRET_KEY", "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY", "RESEND_API_KEY", "RESEND_FROM_EMAIL", "NEXT_PUBLIC_APP_URL", "BROWSERLESS_API_KEY", "ANTHROPIC_API_KEY", "EXCHANGE_RATE_API_KEY", "CRON_SECRET"]) {
    process.env[k] ??= k.includes("URL") ? "http://localhost" : "test";
  }
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

import { prepareProductUrl } from "../extraction.service";

describe("prepareProductUrl reads stores without a scraper in our hub's market", () => {
  it("SKIMS (named, USA): the /en-gh/ market is dropped and the US market pinned", async () => {
    const p = await prepareProductUrl("https://skims.com/en-gh/products/skims-body-core-sculpt-high-waisted-short-onyx");
    expect(p.canonicalUrl).toBe("https://skims.com/products/skims-body-core-sculpt-high-waisted-short-onyx?country=US&currency=USD");
    expect(p.store.slug).toBe("skims");
  });

  it("an unregistered Shopify store keeps its variant and gets the US market", async () => {
    const p = await prepareProductUrl("https://www.thedressoutlet.com/products/dress?variant=67380796948851");
    expect(p.canonicalUrl).toBe("https://www.thedressoutlet.com/products/dress?country=US&currency=USD&variant=67380796948851");
  });

  it("a UK store is read in the UK market; a store with its own scraper is left alone", async () => {
    expect((await prepareProductUrl("https://www.boohoo.com/products/dress")).canonicalUrl).toContain("country=GB&currency=GBP");
    expect((await prepareProductUrl("https://www.amazon.com/dp/B0CHX1W1XY")).canonicalUrl).not.toContain("country=");
  });
});
