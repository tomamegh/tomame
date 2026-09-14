import type { NextRequest } from "next/server";

import { submitOrderFeedbackSchema } from "@/features/feedback/schema";
import {
  listCustomerOrderFeedback,
  submitOrderFeedback,
} from "@/features/feedback/services/feedback.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * The customer's side of migration 054 — "that is not what I ordered".
 *
 * NOT an admin route and not role-gated: authorisation is OWNERSHIP of the
 * order, which the service establishes before anything is written. An order
 * belonging to someone else answers 404 rather than 403, so the endpoint cannot
 * be walked to discover which order ids exist.
 *
 * HTTP orchestration only. Which verdicts exist, what happens when the message
 * is blank, and the fact that feedback never pauses a parcel all live in
 * `feedback.service.ts`.
 */

/** `GET /api/orders/:id/feedback` — what I already said, and what came back. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const { id } = await params;
    return successResponse(await listCustomerOrderFeedback(auth, id));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * `POST /api/orders/:id/feedback` — say it.
 *
 * Rate limited on the tight `assisted` budget rather than `general`: every row
 * is work for a person at a warehouse, so six an hour is the right ceiling — far
 * more corrections than any real customer makes, and not enough for a script to
 * bury the queue. Keyed by user where we have one, because the objection is
 * about an order only that user owns.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    if (!checkRateLimit(`order-feedback:${auth.id}`, RATE_LIMIT.assisted).allowed) {
      throw new APIError(429, "You have sent a few of these. Give us a moment to look.");
    }

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = submitOrderFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { id } = await params;
    return successResponse(await submitOrderFeedback(auth, id, parsed.data), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
