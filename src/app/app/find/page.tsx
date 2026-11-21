import type { Metadata } from "next";
import { cookies } from "next/headers";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { FinderChatScreen } from "@/features/finder/components/chat/finder-chat-screen";
import { listChatHistory, listPastedLinks } from "@/features/finder/services/finder-chat.service";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";

export const metadata: Metadata = {
  title: "Shopping assistant",
  description: "Tell us what you want, one thing or several. We search the US stores we buy from and show the best price landed in Accra.",
};

/** A new chat with the shopping assistant (107), with the viewer's history beside it. `?q=` fills the box. */
export default async function FinderPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const text = typeof q === "string" ? q.slice(0, 500) : "";
  const [user, cookieStore] = await Promise.all([getAuthenticatedUser(), cookies()]);
  const viewer = { userId: user?.id ?? null, sessionId: readQuoteSessionFromCookies(cookieStore) };
  const known = viewer.userId != null || viewer.sessionId != null;
  const [history, pastes] = known ? await Promise.all([listChatHistory(viewer, 30), listPastedLinks(viewer)]) : [[], []];
  return <FinderChatScreen initial={null} history={history} pastes={pastes} defaultText={text} signedIn={user != null} />;
}
