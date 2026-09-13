import { NextRequest } from "next/server";

import { insertContactMessage } from "@/db/queries/contact-messages";
import { contactSchema } from "@/features/contact/schema";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * POST /api/contact — where the contact form's message actually goes.
 *
 * There was no such route until now. The form's submit handler set a "Message
 * sent!" flag and threw the message away, so every enquiry anyone ever typed was
 * lost while they were told someone would reply within hours.
 *
 * Public: a visitor with no account is exactly who uses this. The message is
 * stored rather than emailed because Tomame's real support address is not
 * settled in config (the marketing copy says `@tomame.ca`, the mail transport
 * defaults to `@tomame.com`), and a queue an admin can see beats an email to an
 * address that might not exist.
 *
 * `user_id` is recorded when we happen to know the sender, for context only —
 * never for authorization. The reply address is the one they typed.
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    // Each message is work for a person, so this sits on the tight budget with
    // the waitlist and the assisted requests, not on `general`.
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`contact:${ip}`, RATE_LIMIT.assisted).allowed) {
      throw new APIError(429, "You have sent a few of these. Give us a moment to reply.");
    }

    const user = await getAuthenticatedUser();
    const row = await insertContactMessage({
      userId: user?.id ?? null,
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
    });

    // Only the id: nothing here needs to travel back to the browser.
    return successResponse({ id: row.id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
