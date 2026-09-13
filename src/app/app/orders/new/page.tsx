import type { Metadata } from "next";
import { cookies } from "next/headers";

import { listPastesForViewer } from "@/db/queries/extraction-requests";
import { getQuoteFacts } from "@/db/queries/extraction-cache";
import { listOpenAssistedRequestsByUrl } from "@/db/queries/assisted-requests";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { SUPPORTED_STORE_NAMES } from "@/features/extraction/scrapers";
import { PasteQueueView } from "@/features/extraction/components/paste-queue-view";
import { toPasteStatus } from "@/features/extraction/services/paste-status";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";
import { ExtractAndForward } from "./extract-and-forward";

export const metadata: Metadata = {
  title: "Buy for me",
  description: "Paste a link and we will price it, landed in Accra.",
};

/**
 * "Buy for me" — the nav's second tab.
 *
 * It used to be a dead click: with no `?url=` the screen did
 * `router.replace("/app")`, so pressing the tab bounced you straight back to
 * Home and the tab appeared to do nothing at all. Now it is the paste queue —
 * paste a link, it reads in the background, add as many as you like.
 *
 * A `?url=` still means "price this one link and take me to it", which is how
 * the Home paste bar and any shared link arrive. That path is unchanged.
 *
 * Public, like the rest of the quote flow (`src/lib/supabase/proxy.ts` carves
 * this route out): a signed-out visitor sees the links they pasted under their
 * own `tm_quote_session` cookie.
 */
export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; watch?: string }>;
}) {
  const { url, watch } = await searchParams;
  // `?url=` queues the link and comes back here as `?watch=<id>`, so the row is
  // on screen — with its reading animation and its wait copy — while it reads.
  if (url) return <ExtractAndForward />;

  const [user, cookieStore] = await Promise.all([getAuthenticatedUser(), cookies()]);
  const viewer = { userId: user?.id ?? null, sessionId: readQuoteSessionFromCookies(cookieStore) };
  const pastes = await listPastesForViewer(viewer);
  const [facts, assisted] = await Promise.all([
    getQuoteFacts(pastes.map((p) => p.extraction_cache_id ?? "")),
    listOpenAssistedRequestsByUrl(viewer, pastes.map((p) => p.product_url)),
  ]);

  return (
    <PasteQueueView
      initialPastes={pastes.map((p) =>
        toPasteStatus(p, facts.get(p.extraction_cache_id ?? ""), assisted.get(p.product_url) ?? null),
      )}
      stores={SUPPORTED_STORE_NAMES}
      renderedAt={new Date().toISOString()}
      watchId={typeof watch === "string" && watch ? watch : null}
      // Only an account can be told when a slow paste lands; the wait copy must
      // not promise a message to a visitor it cannot reach.
      notifies={user != null}
    />
  );
}
