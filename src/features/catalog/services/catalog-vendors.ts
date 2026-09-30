import { CATALOG_STORES, CATALOG_STORE_SEARCH, type CatalogSearchVendor, type CatalogStore } from "@/config/catalog";
import { fetchCatalogSearch, isScraperApiConfigured, type CatalogSearchFetch, type MapContext } from "./scraperapi-search";
import { fetchZyteCatalogSearch, isZyteConfigured, isZyteSearchStore } from "./zyte-search";

/**
 * Which stores the scraper may search on this run, and the one call that
 * searches a store.
 *
 * A store is searchable when its switch in `CATALOG_STORE_SEARCH` is on AND
 * its vendor has a key here. The claim only ever takes a query of a searchable
 * store, so an unconfigured vendor skips its stores instead of burning a
 * query's failure streak.
 */
export function searchableCatalogStores(configured: Record<CatalogSearchVendor, boolean>): CatalogStore[] {
  return CATALOG_STORES.filter((s) => CATALOG_STORE_SEARCH[s].enabled && configured[CATALOG_STORE_SEARCH[s].vendor]);
}

export function configuredSearchVendors(): Record<CatalogSearchVendor, boolean> {
  return { scraperapi: isScraperApiConfigured(), zyte: isZyteConfigured() };
}

/** One search page, one vendor request. THROWS on a vendor failure. */
export async function fetchCatalogStoreSearch(store: CatalogStore, query: string, ctx: MapContext): Promise<CatalogSearchFetch> {
  if (CATALOG_STORE_SEARCH[store].vendor === "zyte" && isZyteSearchStore(store)) return fetchZyteCatalogSearch(store, query, ctx);
  return fetchCatalogSearch(store, query, ctx);
}
