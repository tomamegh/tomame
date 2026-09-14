import type { NextRequest } from "next/server";
import * as z from "zod";

import { holdOrder, releaseOrderHold } from "@/features/orders/services/order-hold.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * `POST /api/admin/orders/:id/hold` — stop this parcel moving.
 * `DELETE /api/admin/orders/:id/hold` — let it go again.
 *
 * Two verbs, two decisions, deliberately. Releasing is NOT folded into the
 * status endpoint: if advancing a held order also lifted the hold, the guard in
 * `updateOrderStatusAdmin` would be a speed bump an admin clears by pressing the
 * button they were already pressing. Someone has to decide the objection is
 * settled, and that decision gets its own audit row.
 *
 * Separate from `PATCH /api/admin/orders/:id` for the same reason `:id/eta` is:
 * that endpoint changes the STATUS, and a hold is not a status.
 *
 * HTTP orchestration only — auth, validation, status codes. Everything about
 * what a hold means lives in `order-hold.service.ts`.
 */

const holdSchema = z.object({
  /**
   * REQUIRED, and the database agrees: `orders_hold_has_reason` refuses a hold
   * with no reason. Refused here so the admin reads a sentence rather than a
   * 23514 from inside Postgres.
   */
  reason: z
    .string({ error: "Say why this order is being held" })
    .trim()
    .min(3, "Say why this order is being held")
    .max(500),
  /** The objection that prompted it, for the audit trail. Context, not authority. */
  feedback_id: z.uuid().nullable().optional(),
});

const releaseSchema = z.object({
  /** What settled it. Optional — the audit row records the hold either way. */
  note: z.string().trim().max(500).nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-order-hold:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = holdSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { id } = await params;
    return successResponse(await holdOrder(user, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-order-hold:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    // A DELETE routinely arrives with no body at all, so an unparseable one is
    // the empty object rather than a 400 — there is nothing required in it.
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = releaseSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { id } = await params;
    return successResponse(await releaseOrderHold(user, id, parsed.data.note));
  } catch (error) {
    return errorResponse(error);
  }
}
