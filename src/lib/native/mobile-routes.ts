/**
 * Where a website path lands inside the iPhone app.
 *
 * The app loads `/m`, but shared components, emails and Paystack's return URLs all
 * link to `/app/...` and `/auth/login`. The proxy sends a request from the app (its
 * user agent carries {@link APP_UA_MARK}) through this map, so a link built anywhere
 * on the site opens the app's own screen. Anything not listed stays where it is.
 */

/** Appended to the WKWebView user agent by `native/capacitor.config.json`. */
export const APP_UA_MARK = "TomameIOS";

export const isAppUserAgent = (ua: string | null | undefined): boolean => !!ua && ua.includes(APP_UA_MARK);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `/m` path for a site path, or null when the website's page should be served as it is. */
export function mobilePathFor(pathname: string, search: URLSearchParams): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const keep = search.toString() ? `?${search.toString()}` : "";

  if (path === "/auth/login") return `/m/welcome${keep}`;
  if (path === "/app") return "/m";
  if (path === "/app/bag") return `/m/bag${keep}`;
  if (path === "/app/watches") return "/m/watch";
  // A specific tab (addresses, security…) is managed on the website's page for now.
  if (path === "/app/account" && !search.get("tab")) return "/m/account";
  if (path === "/app/find") return "/m/chat";
  // The website's Browse (the priced catalogue) is the app's Shop; same query names.
  if (path === "/app/orders/new" && search.get("mode") === "browse") {
    const rest = new URLSearchParams(search);
    rest.delete("mode");
    return rest.toString() ? `/m/shop?${rest.toString()}` : "/m/shop";
  }

  if (path === "/app/orders") {
    if (search.get("payment") === "success") {
      const group = search.get("group");
      return group ? `/m/paid?group=${encodeURIComponent(group)}` : "/m/paid";
    }
    return "/m/orders";
  }

  const review = path.match(/^\/app\/orders\/review\/([^/]+)$/);
  if (review?.[1]) return `/m/product/${review[1]}`;

  const order = path.match(/^\/app\/orders\/([^/]+)$/);
  if (order?.[1] && UUID.test(order[1])) return `/m/orders/${order[1]}`;

  const chat = path.match(/^\/app\/find\/chat\/([^/]+)$/);
  if (chat?.[1]) return `/m/chat/${chat[1]}`;

  return null;
}
