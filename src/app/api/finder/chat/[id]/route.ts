import { NextRequest, after } from "next/server";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { chatEmailSchema, chatPhoneSchema, finderRunIdSchema } from "@/features/finder/schema";
import { emailTurnWhenSettled, getChatView, updateChatEmail, updateChatPhone } from "@/features/finder/services/finder-chat.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { readQuoteSession } from "@/lib/quote-session";

async function viewerOf(request: NextRequest) {
  const user = await getAuthenticatedUser();
  return { userId: user?.id ?? null, sessionId: readQuoteSession(request) };
}

/** GET /api/finder/chat/[id] — the chat and its searches. `?lite=1` is the poll. Another viewer's chat is a 404. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = finderRunIdSchema.safeParse((await params).id);
    if (!id.success) throw new APIError(404, "We have no record of that chat.");
    const view = await getChatView(id.data, await viewerOf(request), { lite: request.nextUrl.searchParams.get("lite") === "1" });
    if (!view) throw new APIError(404, "We have no record of that chat.");
    return successResponse(view);
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH /api/finder/chat/[id] — `{phone}` (the WhatsApp number we reach the customer on, 109) or a visitor's `{email}`; finished turns not yet sent go now. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = finderRunIdSchema.safeParse((await params).id);
    if (!id.success) throw new APIError(404, "We have no record of that chat.");
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const viewer = await viewerOf(request);
    if (body && typeof body === "object" && "phone" in body) {
      const phone = chatPhoneSchema.safeParse(body);
      if (!phone.success) throw new APIError(400, phone.error.issues[0]?.message ?? "Invalid input");
      const due = await updateChatPhone(id.data, viewer, phone.data.phone);
      after(async () => {
        for (const turn of due) await emailTurnWhenSettled(turn);
      });
      return successResponse({ phone: phone.data.phone });
    }
    const parsed = chatEmailSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    const pending = await updateChatEmail(id.data, viewer, parsed.data.email);
    after(async () => {
      for (const turn of pending) await emailTurnWhenSettled(turn);
    });
    return successResponse({ email: parsed.data.email });
  } catch (error) {
    return errorResponse(error);
  }
}
