import type { Metadata } from "next";
import { cookies } from "next/headers";

import { listPastesForViewer } from "@/db/queries/extraction-requests";
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
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
  if (url) return <ExtractAndForward />;

  const [user, cookieStore] = await Promise.all([getAuthenticatedUser(), cookies()]);
  const viewer = { userId: user?.id ?? null, sessionId: readQuoteSessionFromCookies(cookieStore) };
  const pastes = await listPastesForViewer(viewer);

  return (
    <PasteQueueView
      initialPastes={pastes.map(toPasteStatus)}
      stores={SUPPORTED_STORE_NAMES}
      renderedAt={new Date().toISOString()}
    />
  );
}
