/*
 * Tomame service worker.
 *
 * Scope is deliberately narrow. A service worker on a Next.js App Router site
 * is the easiest way to serve a customer a stale RSC payload against a fresh
 * bundle — a combination that renders as a blank screen with a hydration error
 * and cannot be cleared by a normal refresh — so this one caches only two
 * kinds of thing:
 *
 *   1. Content-hashed build output (`/_next/static/**`) and static brand
 *      artwork, which are immutable by construction.
 *   2. One offline fallback page, shown only when a navigation genuinely fails.
 *
 * Everything else — every `/api/**` call, every RSC navigation payload, every
 * authenticated page — goes straight to the network with no interception at
 * all. That is what makes it safe: nothing that depends on who is signed in,
 * what an order costs, or what a payment did can ever be served from a cache.
 *
 * It exists mostly so Chrome will offer to install the app: Chrome's
 * installability check requires a fetch handler. The offline page is the
 * genuine benefit on a Ghanaian mobile connection.
 *
 * Bump CACHE_VERSION to invalidate everything on the next deploy.
 */

const CACHE_VERSION = "tomame-v1";
const OFFLINE_URL = "/offline";

/** Fetched at install time so the offline page works on the very first drop. */
const PRECACHE = [
  OFFLINE_URL,
  "/images/brand/logo-lockup.webp",
  "/images/brand/logo-mark.webp",
  "/icons/pwa/icon-192.png",
];

/**
 * Content-hashed build output. The URL changes whenever the bytes do, so a hit
 * here can be served from cache forever without ever going to the network.
 */
const IMMUTABLE_PREFIXES = ["/_next/static/"];

/**
 * Static artwork: served from cache instantly, then refreshed in the
 * background (stale-while-revalidate).
 *
 * These were once treated as immutable alongside `/_next/static/`, which was
 * simply wrong — `/images/brand/logo-mark.webp` keeps its URL when its contents
 * change. Replacing the logo and redeploying would have left every installed
 * customer on the old artwork until somebody remembered to bump
 * CACHE_VERSION by hand. Revalidating costs one background request and makes
 * the next launch correct.
 */
const REVALIDATE_PREFIXES = ["/images/", "/icons/"];

/**
 * Prefixes this worker must never touch, even to read. `/api` and `/auth`
 * carry session state and money; `/admin` is staff-only. Passing them through
 * untouched means a caching bug here can never become an authorisation bug.
 */
const BYPASS_PREFIXES = ["/api/", "/auth/", "/admin"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      // A failed precache must not block activation — an offline page is a
      // nicety, and a worker stuck in "installing" would mean no worker at all.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Lets the page force an update without the user finding Application settings. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

  // An RSC payload is a fragment of a specific build for a specific route. It
  // is not a document and must never come from a cache.
  if (url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return (
          cached ??
          new Response("You are offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  const immutable = IMMUTABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  const revalidate = REVALIDATE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  if (!immutable && !revalidate) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      // Only store a clean 200. An opaque or partial response in the cache is
      // how a stylesheet starts 404ing days after the deploy that broke it.
      const fromNetwork = fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch((error) => {
          // Offline with nothing cached: let the failure reach the page as a
          // failed request, exactly as it would with no worker installed.
          if (!cached) throw error;
          return cached;
        });

      if (!cached) return fromNetwork;
      // Answer from cache now. For revalidating prefixes the refresh continues
      // in the background and lands in time for the next load; for immutable
      // ones there is nothing to refresh.
      if (revalidate) event.waitUntil(fromNetwork.catch(() => undefined));
      return cached;
    }),
  );
});
