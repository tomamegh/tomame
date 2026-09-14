/**
 * Which half of "Buy for me" the customer is looking at.
 *
 * `/app/orders/new` has two jobs that used to be one screen: paste a link we
 * will go and read, and look at what we have already read and priced. The
 * second had no way in at all. The catalogue lived at `/app/products` and the
 * only link to it was a rail beside a quote, which you could only reach BY
 * pasting a link first. Kelvin: "To access search without a link, a user must
 * first search with a link, and then navigate there."
 *
 * The mode is a query parameter and nothing else, the way the admin filters and
 * the catalogue search already work here: the back button moves between the two
 * halves, a browsed category has an address somebody can send, and the page
 * stays a server component because there is no client state to hold.
 *
 * PASTE IS THE DEFAULT, on purpose. The tab's promise is that we will buy
 * anything from any store we support, and the catalogue is a head start, not
 * the shop. Every existing route into here carries no mode at all: the Home
 * paste bar, a shared link, and the forward that `?url=` performs when it hands
 * back a `?watch=`. Those all have to land on the links the customer has in
 * flight, not on a grid of other people's products.
 *
 * Framework free: no React, no `server-only`. The route's server component and
 * the client island that draws the switch both import from here, which is only
 * legal because this module has no "use client" of its own.
 */

export type BuyForMeMode = "paste" | "browse";

export const BUY_FOR_ME_PATH = "/app/orders/new";

/**
 * What `?mode=` means. Anything unrecognised is paste, never a 404: a mistyped
 * or truncated link should open the screen, not break it.
 */
export function resolveBuyForMeMode(raw: string | string[] | undefined): BuyForMeMode {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return (first ?? "").trim().toLowerCase() === "browse" ? "browse" : "paste";
}

/** The address of a mode, and of one category inside browse mode. */
export function buyForMeHref(mode: BuyForMeMode, category?: string | null): string {
  if (mode === "paste") return BUY_FOR_ME_PATH;
  const params = new URLSearchParams({ mode: "browse" });
  const trimmed = category?.trim();
  if (trimmed) params.set("category", trimmed);
  return `${BUY_FOR_ME_PATH}?${params.toString()}`;
}

/**
 * Which category browse mode opens on.
 *
 * `?category=` is matched case insensitively against the categories the
 * catalogue actually holds, so a link that has been through a mail client's
 * lowercasing still opens the right shelf. An unknown or absent category falls
 * back to the first on offer, which the service returns largest first: a
 * customer arriving with no opinion sees the fullest shelf we have.
 *
 * Returns null only when there is nothing to browse at all, which is the one
 * case the screen must say out loud rather than dress up.
 */
export function resolveBrowseCategory(
  raw: string | string[] | undefined,
  available: readonly { category: string }[],
): string | null {
  const fallback = available[0];
  if (!fallback) return null;
  const first = Array.isArray(raw) ? raw[0] : raw;
  const asked = (first ?? "").trim().toLowerCase();
  if (asked) {
    const match = available.find((entry) => entry.category.trim().toLowerCase() === asked);
    if (match) return match.category;
  }
  return fallback.category;
}
