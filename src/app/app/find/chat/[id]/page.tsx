import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { FinderChatScreen } from "@/features/finder/components/chat/finder-chat-screen";
import { finderRunIdSchema } from "@/features/finder/schema";
import { getChatView, listChatHistory } from "@/features/finder/services/finder-chat.service";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";

export const metadata: Metadata = {
  title: "Shopping assistant",
  description: "Your conversation with Tomame's shopping assistant and the prices it found, landed in Accra.",
  robots: { index: false },
};

/** One chat (107). Scoped to its viewer like a finder run: anyone else's id is a 404, not a login wall. */
export default async function FinderChatPage({ params }: { params: Promise<{ id: string }> }) {
  const id = finderRunIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const [user, cookieStore] = await Promise.all([getAuthenticatedUser(), cookies()]);
  const viewer = { userId: user?.id ?? null, sessionId: readQuoteSessionFromCookies(cookieStore) };
  const [view, history] = await Promise.all([getChatView(id.data, viewer), listChatHistory(viewer, 30)]);
  if (!view) notFound();
  return <FinderChatScreen key={view.id} initial={view} history={history} signedIn={user != null} />;
}
