import { CATALOG_STORES, type CatalogStore } from "@/config/catalog";

/**
 * The stores the finder searches: the catalogue's, plus Target, searched
 * live through its own free API (the catalogue does not hold Target rows).
 */
export const FINDER_STORES = [...CATALOG_STORES, "target"] as const;
export type FinderStore = CatalogStore | "target";

export function isCatalogueStore(store: FinderStore): store is CatalogStore {
  return (CATALOG_STORES as readonly string[]).includes(store);
}
