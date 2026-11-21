import { NextRequest, after } from "next/server";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { finderChatRateLimit, finderLimitMessage, finderRateLimit } from "@/features/finder/admission";
import { chatMessageSchema } from "@/features/finder/schema";
import { emailTurnWhenSettled, listChatHistory, sendChatMessage } from "@/features/finder/services/finder-chat.service";
import { runFinderJob } from "@/features/finder/services/finder-run.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, rateLimitSubject } from "@/lib/rate-limit";
import { readQuoteSession, resolveViewer } from "@/lib/quote-session";

// The reply is immediate; `after()` keeps the invocation alive for the turn's
// searches, each of which stops starting new work at FINDER.deadlineMs.
export const maxDuration = 300;

/**
 * POST /api/finder/chat — one message to the shopping assistant (107). Saves
 * it, answers, and starts one search per item it names; the searches run
 * behind the response and the chat screen polls them. Public like the
 * finder: a visitor is minted the quote-session cookie.
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = chatMessageSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    const user = await getAuthenticatedUser();
    const subject = rateLimitSubject(request, user?.id);
    const chatLimit = finderChatRateLimit(subject, user != null);
    if (!(await checkRateLimit(chatLimit.key, chatLimit.config)).allowed) {
      throw new APIError(429, "That's a lot of messages in a short time. Give it a few minutes and try again.");
    }

    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);
    const searchLimit = finderRateLimit(subject, user != null);
    const result = await sendChatMessage(
      viewer,
      { chatId: parsed.data.chat_id ?? null, text: parsed.data.text, email: user ? null : parsed.data.email ?? null },
      async () => (await checkRateLimit(searchLimit.key, searchLimit.config)).allowed,
      finderLimitMessage(user != null),
    );

    after(async () => {
      await Promise.all(result.newRunIds.map((id) => runFinderJob(id)));
      // Every item may have been an earlier search: the email goes now. The claim keeps it to one.
      await emailTurnWhenSettled(result.turn);
    });
    return finalize(successResponse({ chatId: result.chat.id, messages: result.messages }, 201));
  } catch (error) {
    return errorResponse(error);
  }
}

/** GET /api/finder/chat — the viewer's chat history, newest first. */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const viewer = { userId: user?.id ?? null, sessionId: readQuoteSession(request) };
    if (!viewer.userId && !viewer.sessionId) return successResponse({ chats: [] });
    return successResponse({ chats: await listChatHistory(viewer, 30) });
  } catch (error) {
    return errorResponse(error);
  }
}
