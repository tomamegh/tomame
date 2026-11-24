import { isGroupedView, SHOP_CONDITIONS, SHOP_STORES, type ShopState } from "@/features/catalog/shop-params";

/**
 * The app's Shop address for a shop state, with `patch` applied. The same query names as the
 * website's Browse (`shopHref`), so `parseShopParams` reads either; only the path differs.
 */
export function mobileShopHref(state: ShopState, patch: Partial<ShopState> = {}): string {
  const touchesPage = "page" in patch;
  const next: ShopState = { ...state, ...patch, page: touchesPage ? (patch.page ?? 1) : 1 };
  const view = next.view === "all" && isGroupedView({ ...next, view: null }) ? "all" : null;
  const params = new URLSearchParams();
  if (next.q.trim()) params.set("q", next.q.trim());
  if (next.category) params.set("category", next.category);
  for (const store of next.stores.filter((s) => (SHOP_STORES as readonly string[]).includes(s))) params.append("store", store);
  for (const c of next.conditions.filter((c) => SHOP_CONDITIONS.some((k) => k.value === c))) params.append("condition", c);
  if (next.minGhs != null) params.set("min", String(next.minGhs));
  if (next.maxGhs != null) params.set("max", String(next.maxGhs));
  if (next.rating != null) params.set("rating", String(next.rating));
  if (next.sort !== "recommended") params.set("sort", next.sort);
  if (view) params.set("view", view);
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `/m/shop?${qs}` : "/m/shop";
}
