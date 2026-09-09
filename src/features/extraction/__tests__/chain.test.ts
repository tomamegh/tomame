import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { extraction: { anthropicApiKey: null, apifyApiToken: null, browserlessApiKey: null, rainforestApiKey: null } } }));

import { resolveProduct, continueResolve } from "../resolvers/chain";
import { hasRequiredFields, mergeResult, type MergeState } from "../resolvers/merge";
import { emptyProduct, SupportedPlatform } from "../scrapers";
import type { ExtractionResolver } from "../resolvers/types";

function resolver(
  name: ExtractionResolver["name"],
  product: Record<string, unknown>,
  opts: Partial<Pick<ExtractionResolver, "defaultConfidence" | "shouldRun" | "available">> & { throws?: boolean } = {},
): ExtractionResolver & { calls: number } {
  const r = {
    name,
    calls: 0,
    defaultConfidence: opts.defaultConfidence ?? 0.8,
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
      name: "platform-html", defaultConfidence: 0.9, available: () => true, shouldRun: () => true,
      resolve: async (ctx) => { await ctx.getHtml(); return { product: { title: "T" } }; },
    };
    const b: ExtractionResolver = {
      name: "structured-data", defaultConfidence: 0.8, available: () => true, shouldRun: () => true,
      resolve: async (ctx) => { await ctx.getHtml(); return { product: { price: 5, currency: "USD", weight_lbs: 1 } }; },
    };
    const out = await resolveProduct({ ...base, resolvers: [a, b], fetchHtml });
    expect(fetchHtml).toHaveBeenCalledTimes(1);
    expect(out.htmlSource).toBe("direct");
  });

  it("fast mode stops once required fields are known and reports what it skipped", async () => {
    const cheap = resolver("platform-html", { title: "Desk", price: 99.5, currency: "USD" });
    const llm = resolver("llm", { weight_lbs: 3.2 });
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
      name: "platform-html", defaultConfidence: 0.9, available: () => true, shouldRun: () => true,
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
      name: "platform-html", defaultConfidence: 0.9, available: () => true, shouldRun: () => true,
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
