import { NextRequest, after } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { finderRunIdSchema, updateFinderContactSchema } from "@/features/finder/schema";
import { getFinderRunView, sendFinderEmail, updateFinderContact } from "@/features/finder/services/finder-run.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, rateLimitSubject } from "@/lib/rate-limit";
import { resolveViewer } from "@/lib/quote-session";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/finder/:id — the run as the screen draws it: status and every
 * narration event so far. Viewer-scoped: another visitor's id is a 404.
 * `?lite=1` is the 2-second poll (skips the email and settings reads).
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const id = finderRunIdSchema.safeParse((await params).id);
    if (!id.success) throw new APIError(404, "We have no record of that search.");

    const user = await getAuthenticatedUser();
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);
    if (!(await checkRateLimit(`finder-read:${rateLimitSubject(request, user?.id)}`, RATE_LIMIT.poll)).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const view = await getFinderRunView(id.data, viewer, { lite: request.nextUrl.searchParams.get("lite") === "1" });
    if (!view) throw new APIError(404, "We have no record of that search.");
    return finalize(successResponse(view));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/finder/:id — where the result goes: a visitor's email address,
 * and the WhatsApp switch. A run that already finished is emailed now.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const id = finderRunIdSchema.safeParse((await params).id);
    if (!id.success) throw new APIError(404, "We have no record of that search.");
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = updateFinderContactSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    const user = await getAuthenticatedUser();
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);
    if (!(await checkRateLimit(`finder-contact:${rateLimitSubject(request, user?.id)}`, RATE_LIMIT.general)).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { view, sendNow } = await updateFinderContact(id.data, viewer, {
      ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
      ...(parsed.data.notify_whatsapp !== undefined ? { notifyWhatsapp: parsed.data.notify_whatsapp } : {}),
    });
    if (sendNow) after(() => sendFinderEmail(sendNow));
    return finalize(successResponse(view));
  } catch (error) {
    return errorResponse(error);
  }
}
