import { env } from "@/lib/env";
import { classifyCategory } from "../category.service";
import { hasRequiredFields } from "./merge";
import type { ExtractionResolver, ResolveContext, ResolverResult } from "./types";

function breadcrumbsOf(ctx: ResolveContext): string[] {
  const raw = ctx.current.metadata.breadcrumbs;
  return Array.isArray(raw) ? raw.filter((c): c is string => typeof c === "string") : [];
}

/**
 * Category from the store's own taxonomy — static maps, then the learned
 * `store_category_map`, then a Haiku call that is written back. Starts the
 * moment title + price are known, in parallel with whatever else is running,
 * so the classifier's ~1 s overlaps the hedged vendors instead of following them.
 */
export const categoryResolver: ExtractionResolver = {
  name: "category-map",
  defaultConfidence: 0.75,
  needsHtml: false,
  startWhen: (ctx) => hasRequiredFields(ctx.current),
  available: () => true,
  shouldRun: (ctx) => hasRequiredFields(ctx.current) && ctx.current.category == null,
  async resolve(ctx: ResolveContext): Promise<ResolverResult> {
    if (!ctx.current.title) return { product: {} };
    if (ctx.deadline - Date.now() < 1_500) return { product: {} };
    const result = await classifyCategory(
      {
        store: ctx.platform,
        title: ctx.current.title,
        brand: ctx.current.brand,
        breadcrumbs: breadcrumbsOf(ctx),
        categoryText: typeof ctx.current.metadata.categoryText === "string" ? ctx.current.metadata.categoryText : null,
      },
      ctx.signal,
    );
    if (!result) return { product: {} };
    // Seeds are as good as a platform parser; LLM guesses rank below any parser that knows the store.
    const confidence = result.source === "seed" ? 0.9 : result.source === "map" ? 0.85 : Math.min(0.8, Math.max(0.5, result.confidence));
    return { product: { category: result.category }, confidence: { category: confidence } };
  },
};

/** Exposed so a store plan can be checked for the LLM key without importing the service. */
export const classifierAvailable = () => env.extraction.anthropicApiKey !== null;
