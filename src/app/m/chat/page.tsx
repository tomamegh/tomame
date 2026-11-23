import { cookies } from "next/headers";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { FinderChatScreen } from "@/features/finder/components/chat/finder-chat-screen";
import { listChatHistory, listPastedLinks } from "@/features/finder/services/finder-chat.service";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";
import { ChatFrame } from "@/features/mobile/components/chat-frame";

/** A new Buy for me chat. */
export default async function MobileNewChatPage() {
  const [user, cookieStore] = await Promise.all([getAuthenticatedUser(), cookies()]);
  const viewer = { userId: user?.id ?? null, sessionId: readQuoteSessionFromCookies(cookieStore) };
  const [history, pastes] = await Promise.all([listChatHistory(viewer, 30), listPastedLinks(viewer)]);
  return (
    <ChatFrame>
      <FinderChatScreen initial={null} history={history} pastes={pastes} signedIn={user != null} variant="app" />
    </ChatFrame>
  );
}
