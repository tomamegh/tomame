import type { NextRequest } from "next/server";
import * as z from "zod";

import { canAccessAdmin, getUserSession } from "@/features/auth/services/auth.service";
import { setOrderEtaWindow } from "@/features/orders/services/admin-eta.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * `PATCH /api/admin/orders/:id/eta` — set, adjust or clear an order's delivery
 * window (migration 050).
 *
 * Separate from `PATCH /api/admin/orders/:id` because that endpoint changes the
 * STATUS and only writes the window as a side effect of the `in_transit`
 * transition. Freight slips after it has shipped, and until this route existed
 * there was no way to say so — see `admin-eta.service.ts`.
 *
 * HTTP orchestration only: auth, validation, status codes. Every rule about
 * which orders have a window, what the midpoint is and what gets audited lives
 * in the service.
 */

/** An ISO calendar day, `YYYY-MM-DD` — the shape of a Postgres DATE. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD form");

const etaWindowSchema = z
  .object({
    eta_from: isoDate.optional(),
    eta_to: isoDate.optional(),
    /** Explicit, so "clear the window" cannot be confused with "you sent nothing". */
    clear: z.boolean().optional(),
  })
  // A backwards window would pass the column CHECK only by luck of which end is
  // which; refuse it here so the admin reads a sentence rather than a 23514.
  .refine((v) => !v.eta_from || !v.eta_to || v.eta_to >= v.eta_from, {
    message: "The end of the window cannot be before its start",
    path: ["eta_to"],
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-order-eta:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    // `src/proxy.ts` already gates the whole `/api/admin` prefix. This check is
    // the second lock on the same door, and it is written out because the one
    // route that skipped it shipped live revenue to anonymous callers.
    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = etaWindowSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { id } = await params;
    const order = await setOrderEtaWindow(user, id, parsed.data);
    return successResponse(order);
  } catch (error) {
    return errorResponse(error);
  }
}
