import "server-only";

import { CACHE_TAGS, sharedCache } from "@/lib/shared-cache";
import { getShopDepartmentGroups } from "@/features/catalog/services/catalog-shop.service";
import { listBrowsableCategories } from "@/features/catalog/services/catalog-search.service";

/**
 * The app's Shop front page, priced, kept for five minutes: pricing a few hundred listings on
 * every visit was most of the screen's time. Expires with the catalogue and with any admin
 * pricing change, like the website's own shop reads.
 */
export const cachedShopFront = sharedCache((perGroup: number) => getShopDepartmentGroups(perGroup), ["m-shop-front"], {
  tags: [CACHE_TAGS.catalog, CACHE_TAGS.pricingDisplay],
  revalidateSeconds: 300,
});

export const cachedShopCategories = sharedCache(() => listBrowsableCategories(), ["m-shop-categories"], {
  tags: [CACHE_TAGS.catalog],
  revalidateSeconds: 300,
});
