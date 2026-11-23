import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { FinderChatScreen } from "@/features/finder/components/chat/finder-chat-screen";
import { finderRunIdSchema } from "@/features/finder/schema";
import { getChatView, listChatHistory, listPastedLinks } from "@/features/finder/services/finder-chat.service";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";
import { ChatFrame } from "@/features/mobile/components/chat-frame";

/** One Buy for me conversation, read the same way as the website's `/app/find/chat/[id]`. */
export default async function MobileChatPage({ params }: { params: Promise<{ id: string }> }) {
  const id = finderRunIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const [user, cookieStore] = await Promise.all([getAuthenticatedUser(), cookies()]);
  const viewer = { userId: user?.id ?? null, sessionId: readQuoteSessionFromCookies(cookieStore) };
  const [view, history, pastes] = await Promise.all([getChatView(id.data, viewer), listChatHistory(viewer, 30), listPastedLinks(viewer)]);
  if (!view) notFound();
  return (
    <ChatFrame>
      <FinderChatScreen key={view.id} initial={view} history={history} pastes={pastes} signedIn={user != null} variant="app" />
    </ChatFrame>
  );
}
