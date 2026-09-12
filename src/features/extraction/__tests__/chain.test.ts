import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { extraction: { anthropicApiKey: null, apifyApiToken: null, browserlessApiKey: null, rainforestApiKey: null, scraperApiKey: null } } }));

import { resolveProduct, continueResolve } from "../resolvers/chain";
import { hasRequiredFields, mergeResult, type MergeState } from "../resolvers/merge";
import { emptyProduct, SupportedPlatform } from "../scrapers";
import type { ExtractionResolver } from "../resolvers/types";

function resolver(
  name: ExtractionResolver["name"],
  product: Record<string, unknown>,
  opts: Partial<Pick<ExtractionResolver, "defaultConfidence" | "shouldRun" | "available" | "needsHtml">> & { throws?: boolean } = {},
): ExtractionResolver & { calls: number } {
  const r = {
    name,
    calls: 0,
    defaultConfidence: opts.defaultConfidence ?? 0.8,
    needsHtml: opts.needsHtml ?? false,
    available: opts.available ?? (() => true),
    shouldRun: opts.shouldRun ?? (() => true),
    async resolve() {
      r.calls++;
      if (opts.throws) throw new Error("boom");
      return { product };
    },
  };
  return r;
}

const base = { url: "https://www.amazon.com/dp/B0DSVMVYPH", platform: SupportedPlatform.AMAZON, region: "USA" as const };

describe("merge", () => {
  it("keeps the higher-confidence value per field and ignores junk", () => {
    const state: MergeState = { product: emptyProduct(), confidence: {}, sources: {} };
    mergeResult(state, "structured-data", { product: { title: "OG title", price: 10, currency: "USD" } }, 0.7);
    mergeResult(state, "platform-html", { product: { title: "Real title", price: -1, currency: "usd" } }, 0.9);
    mergeResult(state, "llm", { product: { title: "LLM guess", image: "not-a-url" } }, 0.6);

    expect(state.product.title).toBe("Real title");
    expect(state.sources.title).toBe("platform-html");
    expect(state.product.price).toBe(10); // -1 rejected
    expect(state.product.currency).toBe("USD"); // lowercase rejected
    expect(state.product.image).toBeNull(); // bad URL rejected
  });

  it("typed facts: earlier resolver wins when non-null; junk ratings and counts are rejected", () => {
    const state: MergeState = { product: emptyProduct(), confidence: {}, sources: {} };
    mergeResult(state, "scraperapi", { product: { seller: "6ave", rating: 4.7, review_count: 28773, availability: "In Stock", condition: null } }, 0.95);
    mergeResult(state, "platform-html", { product: { seller: "someone-else", rating: 4.5, review_count: 47, availability: "Only 2 left", condition: "New" } }, 0.9);
    mergeResult(state, "llm", { product: { rating: 9, review_count: 1.5 } }, 0.6);

    expect(state.product.seller).toBe("6ave");
    expect(state.product.rating).toBe(4.7);
    expect(state.product.review_count).toBe(28773);
    expect(state.product.availability).toBe("In Stock");
    expect(state.product.condition).toBe("New"); // first non-null wins
    expect(state.sources.condition).toBe("platform-html");
    expect(state.confidence.seller).toBe(0.95);
  });

  it("images: ordered union, earlier resolver first, de-duplicated, main image leading", () => {
    const state: MergeState = { product: emptyProduct(), confidence: {}, sources: {} };
    mergeResult(state, "scraperapi", { product: { image: "https://a/1.jpg", images: ["https://a/1.jpg", "https://a/2.jpg"] } }, 0.95);
    mergeResult(state, "platform-html", { product: { image: "https://a/3.jpg", images: ["https://a/3.jpg", "https://a/2.jpg", "//a/4.jpg", "not-a-url"] } }, 0.9);
    expect(state.product.image).toBe("https://a/1.jpg");
    expect(state.product.images).toEqual(["https://a/1.jpg", "https://a/2.jpg", "https://a/3.jpg", "https://a/4.jpg"]);

    // A later, more confident main image moves to the front of the gallery.
    mergeResult(state, "rainforest", { product: { image: "https://a/3.jpg" }, confidence: { image: 0.99 } }, 0.95);
    expect(state.product.image).toBe("https://a/3.jpg");
    expect(state.product.images[0]).toBe("https://a/3.jpg");
    expect(state.product.images).toHaveLength(4);
  });

  it("variants: key union, earlier resolver wins per key", () => {
    const state: MergeState = { product: emptyProduct(), confidence: {}, sources: {} };
    mergeResult(state, "oxylabs", { product: { variants: { color: ["Black", "Clay"], material_type: ["Silicone"] } } }, 0.92);
    mergeResult(state, "platform-html", { product: { variants: { color: ["Red"], size: ["S", "M", "- Select -", "S"] } } }, 0.9);
    expect(state.product.variants).toEqual({ color: ["Black", "Clay"], material_type: ["Silicone"], size: ["S", "M"] });
  });
});

describe("resolveProduct", () => {
  it("never throws: a throwing resolver is skipped and later tiers still contribute", async () => {
    const a = resolver("platform-html", {}, { throws: true });
    const b = resolver("structured-data", { title: "Desk", price: 99.5, currency: "USD", weight_lbs: 12 });
    const out = await resolveProduct({ ...base, resolvers: [a, b], fetchHtml: async () => null });
    expect(out.ran).toEqual(["platform-html", "structured-data"]);
    expect(hasRequiredFields(out.product)).toBe(true);
    expect(out.primarySource).toBe("structured-data");
    expect(out.messages).toEqual([]);
  });

  it("stops before costly tiers once required fields and weight are known", async () => {
    const cheap = resolver("platform-html", { title: "Desk", price: 99.5, currency: "USD", weight_lbs: 12 });
    const costly = resolver("llm", { title: "x" });
    const out = await resolveProduct({ ...base, resolvers: [cheap, costly], fetchHtml: async () => null });
    expect(costly.calls).toBe(0);
    expect(out.ran).toEqual(["platform-html"]);
  });

  it("runs the LLM-style tier when weight is missing, then stops", async () => {
    const cheap = resolver("platform-html", { title: "Desk", price: 99.5, currency: "USD" });
    const llm = resolver("llm", { weight_lbs: 3.2, weight: "3.2 lb" }, { defaultConfidence: 0.6 });
    const apify = resolver("apify", { title: "y" }, { shouldRun: (ctx) => !hasRequiredFields(ctx.current) });
    const out = await resolveProduct({ ...base, resolvers: [cheap, llm, apify], fetchHtml: async () => null });
    expect(llm.calls).toBe(1);
    expect(apify.calls).toBe(0);
    expect(out.product.weight_lbs).toBe(3.2);
    expect(out.fieldSources.weight_lbs).toBe("llm");
  });

  it("skips unavailable tiers and reports a partial with messages instead of failing", async () => {
    const off = resolver("apify", { title: "z" }, { available: () => false });
    const partial = resolver("platform-html", { title: "Desk" });
    const out = await resolveProduct({ ...base, resolvers: [off, partial], fetchHtml: async () => ({ html: "<html/>", source: "direct" }) });
    expect(out.ran).toEqual(["platform-html"]);
    expect(hasRequiredFields(out.product)).toBe(false);
    expect(out.messages.some((m) => /price/i.test(m))).toBe(true);
  });

  it("fetches HTML once and shares it between resolvers", async () => {
    const fetchHtml = vi.fn(async () => ({ html: "<html><body>x</body></html>", source: "direct" as const }));
    const a: ExtractionResolver = {
      name: "platform-html", defaultConfidence: 0.9, needsHtml: true, available: () => true, shouldRun: () => true,
      resolve: async (ctx) => { await ctx.getHtml(); return { product: { title: "T" } }; },
    };
    const b: ExtractionResolver = {
      name: "structured-data", defaultConfidence: 0.8, needsHtml: true, available: () => true, shouldRun: () => true,
      resolve: async (ctx) => { await ctx.getHtml(); return { product: { price: 5, currency: "USD", weight_lbs: 1 } }; },
    };
    const out = await resolveProduct({ ...base, resolvers: [a, b], fetchHtml });
    expect(fetchHtml).toHaveBeenCalledTimes(1);
    expect(out.htmlSource).toBe("direct");
  });

  it("fast mode stops once price and category are known and reports what it skipped", async () => {
    const cheap = resolver("platform-html", { title: "Desk", price: 99.5, currency: "USD", category: "Home & Kitchen" });
    const llm = resolver("llm", { weight_lbs: 3.2 }, { shouldRun: (c) => !c.current.weight_lbs });
    const out = await resolveProduct({ ...base, resolvers: [cheap, llm], fetchHtml: async () => null, stopWhenRequired: true });
    expect(llm.calls).toBe(0);
    expect(out.skipped).toEqual(["llm"]);
    expect(out.messages).toEqual([]); // no "weight not listed" while enrichment is still pending

    const enriched = await continueResolve({ ...base, resolvers: [cheap, llm], fetchHtml: async () => null }, out);
    expect(llm.calls).toBe(1);
    expect(cheap.calls).toBe(1); // not re-run
    expect(enriched.product.title).toBe("Desk");
    expect(enriched.product.weight_lbs).toBe(3.2);
    expect(enriched.skipped).toEqual([]);
  });

  it("refetches through the browser when a direct page parsed to no price", async () => {
    const fetchHtml = vi.fn(async (_u: string, opts?: { skipDirect?: boolean }) =>
      opts?.skipDirect ? { html: "<html>full</html>", source: "browserless" as const } : { html: "<html>stripped</html>", source: "direct" as const });
    const parser: ExtractionResolver = {
      name: "platform-html", defaultConfidence: 0.9, needsHtml: true, available: () => true, shouldRun: () => true,
      resolve: async (ctx) => {
        const page = await ctx.getHtml();
        return page?.html.includes("full") ? { product: { title: "Desk", price: 10, currency: "USD", weight_lbs: 1 } } : { product: { title: "Desk" } };
      },
    };
    const llm = resolver("llm", { price: 999 });
    const out = await resolveProduct({ ...base, resolvers: [parser, llm], fetchHtml });
    expect(fetchHtml).toHaveBeenCalledTimes(2);
    expect(fetchHtml.mock.calls[1]?.[1]).toEqual({ skipDirect: true });
    expect(out.product.price).toBe(10);
    expect(llm.calls).toBe(0);
    expect(out.htmlSource).toBe("browserless");
  });

  it("enrichment fetches the page when the fast run answered without one", async () => {
    const api = resolver("rainforest", { title: "Desk", price: 99.5, currency: "USD" });
    const fetchHtml = vi.fn(async () => ({ html: "<html>page</html>", source: "browserless" as const }));
    const parser: ExtractionResolver = {
      name: "platform-html", defaultConfidence: 0.9, needsHtml: true, available: () => true, shouldRun: () => true,
      resolve: async (ctx) => ((await ctx.getHtml()) ? { product: { weight_lbs: 4 } } : { product: {} }),
    };
    const fast = await resolveProduct({ ...base, resolvers: [api, parser], fetchHtml, stopWhenRequired: true });
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(fast.skipped).toEqual(["platform-html"]);

    const enriched = await continueResolve({ ...base, resolvers: [api, parser], fetchHtml }, fast);
    expect(fetchHtml).toHaveBeenCalledTimes(1);
    expect(enriched.product.weight_lbs).toBe(4);
  });
});

describe("resolveProduct — hedged race", () => {
  const slow = (name: ExtractionResolver["name"], ms: number, product: Record<string, unknown>, extra: Partial<ExtractionResolver> = {}) => {
    const r = {
      name,
      calls: 0,
      aborted: false,
      defaultConfidence: 0.9,
      needsHtml: false,
      available: () => true,
      shouldRun: (ctx: { current: { price: number | null } }) => ctx.current.price == null,
      ...extra,
      async resolve(ctx: { signal: AbortSignal }) {
        r.calls++;
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, ms);
          ctx.signal.addEventListener("abort", () => { clearTimeout(t); r.aborted = true; resolve(); }, { once: true });
        });
        return { product };
      },
    };
    return r as ExtractionResolver & { calls: number; aborted: boolean };
  };

  it("starts the next vendor after the hedge window and aborts the loser", async () => {
    const stuck = slow("scraperapi", 5_000, { title: "late", price: 1, currency: "USD" }, { startAfterMs: 50 });
    const quick = slow("zyte", 20, { title: "Desk", price: 99, currency: "USD", category: "Furniture" }, { startAfterMs: 50 });
    const t0 = Date.now();
    const out = await resolveProduct({ ...base, resolvers: [stuck, quick], fetchHtml: async () => null, stopWhenRequired: true });
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(quick.calls).toBe(1);
    expect(stuck.calls).toBe(1);
    expect(stuck.aborted).toBe(true);
    expect(out.ran).toEqual(["zyte"]);
    expect(out.skipped).toContain("scraperapi");
    expect(out.product.title).toBe("Desk");
  });

  it("does not hedge into a sequential (costly) tier while cheaper ones are pending", async () => {
    const vendor = slow("scraperapi", 60, { title: "Desk", price: 99, currency: "USD", category: "Furniture" }, { startAfterMs: 20 });
    const costly = slow("llm", 5, { title: "LLM" }, { shouldRun: () => true });
    const out = await resolveProduct({ ...base, resolvers: [vendor, costly], fetchHtml: async () => null, stopWhenRequired: true });
    expect(costly.calls).toBe(0);
    expect(out.ran).toEqual(["scraperapi"]);
  });

  it("a startWhen tier runs as soon as its precondition holds, even mid-race", async () => {
    const vendor = slow("scraperapi", 30, { title: "Desk", price: 99, currency: "USD" }, { startAfterMs: 20 });
    const laggard = slow("oxylabs", 2_000, { title: "x", price: 1, currency: "USD" }, { startAfterMs: 20 });
    const classifier = slow("category-map", 5, { category: "Furniture" }, {
      startWhen: (ctx) => hasRequiredFields(ctx.current),
      shouldRun: (ctx) => hasRequiredFields(ctx.current) && ctx.current.category == null,
    });
    const t0 = Date.now();
    const out = await resolveProduct({ ...base, resolvers: [vendor, laggard, classifier], fetchHtml: async () => null, stopWhenRequired: true });
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(classifier.calls).toBe(1);
    expect(out.product.category).toBe("Furniture");
    expect(laggard.aborted).toBe(true);
  });
});

describe("resolveProduct — unavailable items", () => {
  it("stops spending once a store reports the item out of stock", async () => {
    const vendor = resolver("oxylabs", { title: "Phone", metadata: { availability: "Out of stock" } });
    const costly = resolver("llm", { price: 1, currency: "USD" });
    const out = await resolveProduct({ ...base, resolvers: [vendor, costly], fetchHtml: async () => null, stopWhenRequired: true });
    expect(costly.calls).toBe(0);
    expect(out.product.price).toBeNull();
    expect(out.messages.some((m) => /unavailable/i.test(m))).toBe(true);
  });

  it("reads the typed availability field as well as the legacy metadata copy", async () => {
    const vendor = resolver("zyte", { title: "Phone", availability: "Out of Stock" });
    const costly = resolver("llm", { price: 1, currency: "USD" });
    const out = await resolveProduct({ ...base, resolvers: [vendor, costly], fetchHtml: async () => null, stopWhenRequired: true });
    expect(costly.calls).toBe(0);
    expect(out.product.availability).toBe("Out of Stock");
    expect(out.messages.some((m) => /unavailable/i.test(m))).toBe(true);
  });

  it("strips zero-width spaces from titles", async () => {
    const r = resolver("scraperapi", { title: "Case​​  with  MagSafe ​ | SHEIN USA", price: 1, currency: "USD", category: "Other" });
    const out = await resolveProduct({ ...base, resolvers: [r], fetchHtml: async () => null, stopWhenRequired: true });
    expect(out.product.title).toBe("Case with MagSafe");
  });
});
