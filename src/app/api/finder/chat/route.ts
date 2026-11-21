import { NextRequest, after } from "next/server";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { finderChatRateLimit, finderLimitMessage, finderRateLimit } from "@/features/finder/admission";
import { chatMessageSchema } from "@/features/finder/schema";
import { emailTurnWhenSettled, listChatHistory, sendChatMessage } from "@/features/finder/services/finder-chat.service";
import { runFinderJob } from "@/features/finder/services/finder-run.service";
import { runPasteJob } from "@/features/extraction/services/extraction-queue.service";
import { RATE_LIMIT } from "@/config/security";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, rateLimitSubject } from "@/lib/rate-limit";
import { readQuoteSession, resolveViewer } from "@/lib/quote-session";

// The reply is immediate; `after()` keeps the invocation alive for the turn's
// searches, each of which stops starting new work at FINDER.deadlineMs, and
// for its pasted links (the paste queue's own budget, as POST /api/pastes).
export const maxDuration = 300;
const PASTE_JOB_BUDGET_MS = 170_000;

/**
 * POST /api/finder/chat — one message to Buy for me's assistant (107, 108).
 * Saves it; links in it go on the paste queue and are read in the thread;
 * words are answered, with one search per item named. The work runs behind
 * the response and the chat screen polls it. Public like the
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
      // Links spend the paste queue's buckets, exactly as POST /api/pastes: a cache hit the looser one.
      async (cacheHit) =>
        (await checkRateLimit(cacheHit ? `paste:cache:${subject}` : `paste:${subject}`, cacheHit ? RATE_LIMIT.extractionCacheHit : RATE_LIMIT.extraction)).allowed,
    );

    after(async () => {
      await Promise.all([...result.newRunIds.map((id) => runFinderJob(id)), ...result.newPasteJobs.map((id) => runPasteJob(id, PASTE_JOB_BUDGET_MS))]);
      // Every item may have been an earlier search: the email goes now. The claim keeps it to one.
      await emailTurnWhenSettled(result.turn);
    });
    return finalize(successResponse({ chatId: result.chat.id, messages: result.messages, readyQuotes: result.readyQuotes }, 201));
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
