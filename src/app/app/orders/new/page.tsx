import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";

import { listOpenAssistedRequestsByUrl } from "@/db/queries/assisted-requests";
import { getQuoteFacts } from "@/db/queries/extraction-cache";
import { listPastesForViewer } from "@/db/queries/extraction-requests";
import { AskMode } from "@/features/finder/components/chat/ask-mode";
import { BuyForMeSwitch } from "@/features/finder/components/chat/buy-for-me-switch";
import { FinderChatScreen } from "@/features/finder/components/chat/finder-chat-screen";
import { listChatHistory, listPastedLinks } from "@/features/finder/services/finder-chat.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import {
  CatalogBrowseEmpty,
  CatalogBrowseUnavailable,
} from "@/features/catalog/components/catalog-browse";
import { resolveCatalogQuery } from "@/features/catalog/components/format";
import { ShopSkeleton } from "@/features/catalog/components/shop/shop-skeleton";
import { ShopView } from "@/features/catalog/components/shop/shop-view";
import { listBrowsableCategories } from "@/features/catalog/services/catalog-search.service";
import {
  isGroupedView,
  parseShopParams,
  shopHref,
  type ShopSearchParams,
} from "@/features/catalog/shop-params";
import {
  buyForMeHref,
  resolveBuyForMeMode,
} from "@/features/extraction/components/buy-for-me-mode";
import { toPasteStatus } from "@/features/extraction/services/paste-status";
import { logger } from "@/lib/logger";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";
import { ExtractAndForward } from "./extract-and-forward";
import { BannerSlot } from "@/features/banners/components";

export const metadata: Metadata = {
  title: "Buy for me",
  description:
    "Paste a link and we will price it, landed in Accra, look through what we have already priced, or ask a buyer to go and find it.",
};

/**
 * "Buy for me" — the nav's second tab, and since 108 the shopping assistant.
 *
 * ONE SCREEN, THREE DOORS (Kelvin: "merge them … so it is not scattered").
 * "Find it" is the chat: words or links in one box. Links are queued on the
 * paste queue and read in the thread; words are answered and searched, one
 * finder run per item. "Browse" is the catalogue, "Ask a buyer" the hand-off
 * form. Chats live at `/app/find/chat/[id]` and light this tab. What follows
 * is the history of how the three doors came to be here.
 *
 * It used to be a dead click: with no `?url=` the screen did
 * `router.replace("/app")`, so pressing the tab bounced you straight back to
 * Home and the tab appeared to do nothing at all. Then it became the paste
 * queue. Now it is all three ways of saying "this is what I want": paste a link,
 * look through what we have already read and priced, or describe it and have a
 * buyer go and find it.
 *
 * WHY THE SECOND HALF IS HERE. The pre-priced catalogue had a screen
 * (`/app/products`) and no way in. The only link to it was a rail beside a
 * quote, and the only way to reach a quote was to paste a link first. Kelvin:
 * "To access search without a link, a user must first search with a link, and
 * then navigate there." This tab is the way in, and it is public, so a visitor
 * with no account can see what we hold before they hand over anything.
 *
 * A `?url=` still means "price this one link and take me to it", which is how
 * the Home paste bar, a shared link and every catalogue card arrive. That path
 * is unchanged and is checked before anything else here, so it costs nothing.
 *
 * Public, like the rest of the quote flow (`src/lib/supabase/proxy.ts` carves
 * this route out): a signed-out visitor sees the links they pasted under their
 * own `tm_quote_session` cookie, and browses the catalogue without an account.
 * `/app/products`, the fuller search this screen links to, was carved out in the
 * same change: leaving it gated while browsing the same catalogue here was open
 * made one half of one feature a login wall, and it was the half a visitor
 * reaches by following our own link.
 *
 * NOTHING HERE PRICES ANYTHING. Every cedi total on a browse card is struck by
 * the pricing engine inside `browseCatalogCategory`, server side, for quantity
 * one; the cards only choose how to print it, and print nothing where the
 * engine declined.
 */
export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<ShopSearchParams & { watch?: string | string[] }>;
}) {
  const params = await searchParams;
  // One `?url=` or several (Home's box, a shared link, a catalogue card): they
  // open a chat with those links in it, read and priced in the thread.
  const hasUrl = Array.isArray(params.url) ? params.url.some(Boolean) : typeof params.url === "string" && params.url !== "";
  if (hasUrl) return <ExtractAndForward />;

  const mode = resolveBuyForMeMode(params.mode);
  const [user, cookieStore] = await Promise.all([getAuthenticatedUser(), cookies()]);
  const viewer = { userId: user?.id ?? null, sessionId: readQuoteSessionFromCookies(cookieStore) };
  const known = viewer.userId != null || viewer.sessionId != null;

  // ── Browse: what we have already priced ────────────────────────────────
  if (mode === "browse") {
    const catalogue = await readCatalogueShape();
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <BannerSlot placement="buy" />
        <BuyForMeSwitch mode="browse" />
        {await renderShop(catalogue, params)}
      </div>
    );
  }

  // ── Ask a buyer: a person buys it by hand ──────────────────────────────
  if (mode === "ask") {
    const pastes = known ? await listPastesForViewer(viewer) : [];
    const [facts, assisted] = await Promise.all([
      getQuoteFacts(pastes.map((p) => p.extraction_cache_id ?? "")),
      listOpenAssistedRequestsByUrl(viewer, pastes.map((p) => p.product_url)),
    ]);
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <BannerSlot placement="buy" />
        <BuyForMeSwitch mode="ask" />
        <AskMode
          initialPastes={pastes.map((p) => toPasteStatus(p, facts.get(p.extraction_cache_id ?? ""), assisted.get(p.product_url) ?? null))}
          renderedAt={new Date().toISOString()}
        />
      </div>
    );
  }

  // ── Find it: the assistant. Words or links, in one box ─────────────────
  const watchId = typeof params.watch === "string" && params.watch ? params.watch : null;
  const q = typeof params.q === "string" ? params.q.slice(0, 500) : "";
  const [history, pastes, watchRows] = known
    ? await Promise.all([listChatHistory(viewer, 30), listPastedLinks(viewer), watchId ? listPastesForViewer(viewer) : Promise.resolve([])])
    : [[], [], []];
  let watch: { id: string; pastes: ReturnType<typeof toPasteStatus>[] } | null = null;
  if (watchId && watchRows.some((r) => r.id === watchId)) {
    const [facts, assisted] = await Promise.all([
      getQuoteFacts(watchRows.map((p) => p.extraction_cache_id ?? "")),
      listOpenAssistedRequestsByUrl(viewer, watchRows.map((p) => p.product_url)),
    ]);
    watch = { id: watchId, pastes: watchRows.map((p) => toPasteStatus(p, facts.get(p.extraction_cache_id ?? ""), assisted.get(p.product_url) ?? null)) };
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <BannerSlot placement="buy" />
      <FinderChatScreen
        initial={null}
        history={history}
        pastes={pastes}
        defaultText={q}
        watch={watch}
        signedIn={user != null}
        header={<BuyForMeSwitch mode="paste" />}
      />
    </div>
  );
}

interface CatalogueShape {
  categories: { category: string; count: number }[];
  /** The read itself failed, which is not the same thing as an empty catalogue. */
  failed: boolean;
}

/**
 * What the catalogue holds, or an honest nothing.
 *
 * A FAILED READ COSTS THE CATALOGUE, NOT THE PAGE. Neither this segment nor
 * `/app` defines an `error.tsx`, so an uncaught throw escalates to the root
 * `global-error.tsx` and replaces the whole application shell: no nav, no tab
 * bar, and the paste form the customer actually came for gone with it. Pasting
 * a link is a different code path and must survive the catalogue being down.
 * Same decision `/app/products` makes for its search.
 *
 * A category with nothing in it is not offered. `listCatalogCategories` already
 * drops empty and nameless ones; the filter here is the guarantee rather than
 * the mechanism.
 */
async function readCatalogueShape(): Promise<CatalogueShape> {
  try {
    const categories = await listBrowsableCategories();
    return { categories: categories.filter((entry) => entry.count > 0), failed: false };
  } catch (error) {
    logger.error("buy-for-me: could not list catalogue categories", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { categories: [], failed: true };
  }
}

/**
 * The browse half: the shop (`ShopView`), built on the server because the
 * pricing engine is server only, then handed to the client island as a
 * finished node.
 *
 * THE ADDRESS IS THE STATE. Filters, sort and page are parsed from the query
 * string by `parseShopParams` and every link on the shop is built by
 * `shopHref`, so a filtered page is shareable and back/forward walks it. The
 * old `?n=` page size is ignored: a link carrying it opens page one.
 *
 * WHY THE URL STAYED. The shop lives on Buy for me's browse mode rather than a
 * new `/app/shop`: every existing way in (Home's department tiles and hero
 * search, the mode switch, shared links) already lands here, the route is in
 * the proxy's public carve-out, the nav already highlights it, and the paste
 * rows that are still reading stay on screen while the customer shops.
 *
 * A RENDER NEVER WRITES. The shop filters and sorts on the calculator's stored
 * figure (migration 080), and the catalogue cron re-prices it every 15 minutes
 * (`/api/cron/catalog-scrape`). Renders used to check the figures' age and
 * schedule a 1,000-row refresh when they were old; on 2026-10-16 a scraper made
 * that ~1,000 refreshes in a night on top of its reads, and it helped take the
 * database down. A row the cron has not reached yet sorts on its old figure,
 * and its card is still priced live.
 *
 * THE SUSPENSE BOUNDARY IS KEYED BY THE ADDRESS, so every filter, sort and
 * page shows the skeleton instead of leaving the old grid up under a new chip.
 */
async function renderShop(catalogue: CatalogueShape, params: ShopSearchParams) {
  const pasteHref = buyForMeHref("paste");
  const queryState = resolveCatalogQuery(params.q);
  // `too-short` is no search at all here: the shop always has shelves to fall
  // back to, so one stray character shows the catalogue instead of an error.
  const q = queryState.kind === "ready" ? queryState.query : "";

  if (catalogue.failed) return <CatalogBrowseUnavailable pasteHref={pasteHref} />;
  if (catalogue.categories.length === 0) return <CatalogBrowseEmpty pasteHref={pasteHref} />;

  const departments = catalogue.categories.map((entry) => entry.category);
  const state = { ...parseShopParams(params, departments), q };

  return (
    <Suspense key={shopHref(state)} fallback={<ShopSkeleton grouped={isGroupedView(state)} />}>
      <ShopView state={state} departments={departments} now={new Date()} pasteHref={pasteHref} />
    </Suspense>
  );
}
