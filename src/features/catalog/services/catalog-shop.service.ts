import "server-only";
import {
  browseCatalogProducts,
  listCatalogDepartmentTops,
  listCatalogShopFacets,
  type CatalogFacetRow,
  type CatalogShopHit,
  type CatalogShopQuery,
  type CatalogStore,
} from "@/db/queries/catalog";
import { loadPricingCalculator } from "@/features/pricing/services/pricing.service";
import type { PricingCalculator } from "@/lib/pricing/calculator";
import {
  SHOP_CONDITIONS,
  SHOP_GROUP_SIZE,
  SHOP_PAGE_SIZE,
  SHOP_PRICE_BUCKETS,
  SHOP_PRICE_EDGES,
  SHOP_RATINGS,
  SHOP_STORES,
  type ShopCondition,
  type ShopPriceBucket,
  type ShopRating,
  type ShopState,
} from "../shop-params";
import { priceHit, type CatalogSearchResult } from "./catalog-search.service";

/**
 * The shop: the priced catalogue, filtered, sorted and paged in Postgres.
 *
 * TWO NUMBERS, TWO JOBS. The database orders and filters on `landed_ghs`, the
 * calculator's stored figure (see `catalog-landed-price.service.ts`). The cards
 * print a figure struck LIVE for the page being drawn — 24 calculations on one
 * loaded calculator — so what a customer reads is never older than the render.
 * The two agree unless FX or a pricing constant moved inside the refresh
 * window, and then only the ordering lags.
 */

export interface ShopProduct extends CatalogSearchResult {
  condition_group: ShopCondition | null;
}

export interface ShopFacetOption<T extends string | number> {
  value: T;
  count: number;
}

export interface ShopFacets {
  departments: ShopFacetOption<string>[];
  stores: ShopFacetOption<CatalogStore>[];
  conditions: ShopFacetOption<ShopCondition>[];
  prices: (ShopFacetOption<number> & { bucket: ShopPriceBucket })[];
  ratings: ShopFacetOption<ShopRating>[];
  /** The priced floor and ceiling under the other filters, for the inputs' placeholders. */
  range: { min: number; max: number } | null;
}

export type ShopPageResult =
  | {
      kind: "page";
      products: ShopProduct[];
      total: number;
      page: number;
      pageCount: number;
      facets: ShopFacets;
    }
  /** `?page=` past the last page of a set that is not empty. */
  | { kind: "past-end"; total: number; pageCount: number; facets: ShopFacets };

export function toShopQuery(state: ShopState): CatalogShopQuery {
  return {
    q: state.q.trim() || null,
    category: state.category,
    stores: state.stores,
    conditions: state.conditions,
    minGhs: state.minGhs,
    maxGhs: state.maxGhs,
    minRating: state.rating,
  };
}

export async function getShopPage(state: ShopState): Promise<ShopPageResult> {
  const query = toShopQuery(state);
  const [{ rows, total: pageTotal }, facetRows] = await Promise.all([
    browseCatalogProducts(query, {
      sort: state.sort,
      limit: SHOP_PAGE_SIZE,
      offset: (state.page - 1) * SHOP_PAGE_SIZE,
    }),
    listCatalogShopFacets(query, SHOP_PRICE_EDGES),
  ]);
  const facets = toShopFacets(facetRows);

  if (rows.length === 0 && state.page > 1) {
    // No row carried the window total, so the set's size comes from the facets:
    // every row has a store, and the store group is counted with every other
    // filter on and its own off — re-applying the store filter gives the set.
    const total = facetTotal(facets, state);
    if (total > 0) return { kind: "past-end", total, pageCount: Math.ceil(total / SHOP_PAGE_SIZE), facets };
  }

  const products = await priceRows(rows);
  return {
    kind: "page",
    products,
    total: pageTotal,
    page: state.page,
    pageCount: Math.max(1, Math.ceil(pageTotal / SHOP_PAGE_SIZE)),
    facets,
  };
}

/** The sidebar's counts alone, for the grouped front page (which has no page of rows). */
export async function getShopFacets(state: ShopState): Promise<ShopFacets> {
  return toShopFacets(await listCatalogShopFacets(toShopQuery(state), SHOP_PRICE_EDGES));
}

/** How many rows the filtered set holds, from its facets (every row has exactly one store). */
export function facetTotal(facets: ShopFacets, state: ShopState): number {
  return facets.stores
    .filter((s) => state.stores.length === 0 || state.stores.includes(s.value))
    .reduce((sum, s) => sum + s.count, 0);
}

export interface ShopDepartmentGroup {
  category: string;
  /** Everything we hold in the department, for "See all". */
  count: number;
  products: ShopProduct[];
}

/** The grouped front page: every department's first few, priced on one calculator. */
export async function getShopDepartmentGroups(): Promise<ShopDepartmentGroup[]> {
  const rows = await listCatalogDepartmentTops(SHOP_GROUP_SIZE);
  if (rows.length === 0) return [];
  const priced = await priceRows(rows);

  const groups = new Map<string, ShopDepartmentGroup>();
  rows.forEach((row, i) => {
    const category = row.category ?? "";
    const group = groups.get(category) ?? { category, count: row.category_count, products: [] };
    group.products.push(priced[i]!);
    groups.set(category, group);
  });
  return [...groups.values()];
}

async function priceRows(rows: readonly CatalogShopHit[]): Promise<ShopProduct[]> {
  if (rows.length === 0) return [];
  const calculator: PricingCalculator = await loadPricingCalculator();
  const out: ShopProduct[] = [];
  // Sequential: the first `calculate` loads FX onto the instance; a parallel
  // burst races that load. The database's order is kept as it came — it is the
  // order the pager is built on.
  for (const row of rows) {
    const priced = await priceHit(calculator, row);
    out.push({ ...priced, condition_group: row.condition_group ?? null });
  }
  return out;
}

/** The RPC's flat rows as the sidebar's groups, in the sidebar's own order. Pure; exported for its test. */
export function toShopFacets(rows: readonly CatalogFacetRow[]): ShopFacets {
  const of = (facet: CatalogFacetRow["facet"]) => rows.filter((r) => r.facet === facet);
  const count = (facet: CatalogFacetRow["facet"], value: string) =>
    of(facet).find((r) => r.value === value)?.n ?? 0;

  const range = of("range");
  const min = range.find((r) => r.value === "min")?.n;
  const max = range.find((r) => r.value === "max")?.n;

  return {
    departments: of("category")
      .map((r) => ({ value: r.value, count: r.n }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    stores: SHOP_STORES.map((value) => ({ value, count: count("store", value) })),
    conditions: SHOP_CONDITIONS.map((c) => ({ value: c.value, count: count("condition", c.value) })),
    prices: SHOP_PRICE_BUCKETS.map((bucket) => ({
      value: bucket.index,
      bucket,
      count: count("price", String(bucket.index)),
    })),
    ratings: SHOP_RATINGS.map((value) => ({ value, count: count("rating", String(value)) })),
    range: min != null && max != null ? { min, max } : null,
  };
}
