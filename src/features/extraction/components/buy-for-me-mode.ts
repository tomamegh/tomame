/**
 * Which of the three ways into "Buy for me" the customer is looking at.
 *
 * `/app/orders/new` has three jobs that used to be one screen, and then two:
 * paste a link we will go and read, look at what we have already read and
 * priced, and ask a person to go and buy it. The second had no way in at all —
 * the catalogue lived at `/app/products` and the only link to it was a rail
 * beside a quote, which you could only reach BY pasting a link first. Kelvin:
 * "To access search without a link, a user must first search with a link, and
 * then navigate there."
 *
 * The third had no way in either, and that one is worse. The concierge route is
 * the whole business — a person in the US buys the thing on their own card — and
 * a signed-in customer could only discover it by pasting a link that FAILED and
 * then noticing "Describe it instead" on the wreckage. So it is a mode of its
 * own, named on the switch, reachable before anything has gone wrong.
 *
 * The mode is a query parameter and nothing else, the way the admin filters and
 * the catalogue search already work here: the back button moves between the
 * three, a browsed category has an address somebody can send, and the page stays
 * a server component because there is no client state to hold.
 *
 * PASTE IS THE DEFAULT, on purpose. The tab's promise is that we will buy
 * anything from any store we support, and the catalogue is a head start, not
 * the shop. Every existing route into here carries no mode at all: the Home
 * paste bar, a shared link, and the forward that `?url=` performs when it hands
 * back a `?watch=`. Those all have to land on the links the customer has in
 * flight, not on a grid of other people's products and not on a form.
 *
 * Framework free: no React, no `server-only`. The route's server component and
 * the client island that draws the switch both import from here, which is only
 * legal because this module has no "use client" of its own.
 */

export type BuyForMeMode = "paste" | "browse" | "ask";

export const BUY_FOR_ME_PATH = "/app/orders/new";

/**
 * What `?mode=` means. Anything unrecognised is paste, never a 404: a mistyped
 * or truncated link should open the screen, not break it.
 */
export function resolveBuyForMeMode(raw: string | string[] | undefined): BuyForMeMode {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const asked = (first ?? "").trim().toLowerCase();
  if (asked === "browse") return "browse";
  if (asked === "ask") return "ask";
  return "paste";
}

/** Everything browse mode can carry in the address. All of it optional. */
export interface BuyForMeQuery {
  /** The open shelf. Null or absent means "whatever the catalogue offers first". */
  category?: string | null;
  /** A search over the catalogue. Lives alongside `category`, which then filters it. */
  q?: string | null;
  /** How many rows to render. Absent means the first page. */
  n?: number | null;
}

/**
 * The address of a mode, and of a shelf, a search and a page size inside browse
 * mode.
 *
 * All four pieces of state are query parameters and nothing else, which is what
 * keeps this screen a server component: a search is shareable, the back button
 * walks back through searches and shelves, and "show more" is a link rather
 * than a piece of client state that a reload would forget.
 *
 * `BuyForMeQuery` belongs to browse and only to browse. Paste keeps the bare
 * path — every link into it that already exists is written that way — and ask is
 * one form with nothing to address inside it, so both drop the query rather than
 * carrying a category nothing over there can open.
 */
export function buyForMeHref(mode: BuyForMeMode, query?: BuyForMeQuery): string {
  if (mode === "paste") return BUY_FOR_ME_PATH;
  if (mode === "ask") return `${BUY_FOR_ME_PATH}?mode=ask`;
  const params = new URLSearchParams({ mode: "browse" });
  const category = query?.category?.trim();
  if (category) params.set("category", category);
  const q = query?.q?.trim();
  if (q) params.set("q", q);
  // The first page is the default, so it is never written into the address.
  if (query?.n != null && query.n > 0) params.set("n", String(query.n));
  return `${BUY_FOR_ME_PATH}?${params.toString()}`;
}

/**
 * Does this look like a link the extractor should go and read, rather than
 * words to search the catalogue for?
 *
 * ONE BOX NOW DOES BOTH JOBS. The screen used to have a paste box and, below
 * it, a sentence with "Search by name" in it — Kelvin, 2026-09-14: "a link very
 * small beneath that most users will miss". So the box takes either, and this
 * is the fork.
 *
 * Deliberately permissive about the scheme and deliberately strict about the
 * shape: people paste `amazon.com/dp/...` without a scheme all day, and the
 * paste endpoint normalises that perfectly well. What must NOT be read as a link
 * is ordinary search text, so a match needs a dot inside a first token that
 * carries no space, and a plausible TLD after it. "wireless earbuds" has a
 * space. "3.5mm jack" has a space too, and even alone its "mm" fails the TLD
 * test below.
 *
 * Framework free and regex only, because this module is imported by the client
 * island as well as the route. `src/features/extraction/url.ts` is the real
 * parser and it pulls in `node:crypto`, so it can never come along.
 */
export function looksLikeUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return false;
  if (/^https?:\/\//i.test(value)) return true;
  // host[:port][/path…] where the host's last label is 2+ letters.
  return /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(value);
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
