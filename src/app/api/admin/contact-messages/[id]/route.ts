import { NextRequest } from "next/server";
import { z } from "zod";

import { transitionContactMessage, type ContactMessageStatus } from "@/db/queries/contact-messages";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const schema = z.object({
  from: z.enum(["open", "answered", "closed"]),
  status: z.enum(["answered", "closed"]),
  note: z.string().trim().max(2000).nullable().optional(),
});

/**
 * PATCH /api/admin/contact-messages/:id
 *
 * `from` is the status the admin saw when they opened the queue; the transition
 * is guarded on it, so two of them acting at once cannot both claim the same
 * message — the second gets a 409 rather than silently overwriting the first.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-contact-write:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const { id } = await params;
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const row = await transitionContactMessage({
      id,
      from: parsed.data.from as ContactMessageStatus,
      to: parsed.data.status,
      handledBy: user.id,
      note: parsed.data.note,
    });
    if (!row) throw new APIError(409, "Someone else already picked this one up. Refresh the queue.");

    await logAuditEvent({
      actorId: user.id,
      actorRole: AUDIT_ACTOR_ROLES.ADMIN,
      action: "contact_message_updated",
      entityType: AUDIT_ENTITY_TYPES.CONTACT_MESSAGE,
      entityId: id,
      metadata: { from: parsed.data.from, to: parsed.data.status },
    });

    return successResponse(row);
  } catch (error) {
    return errorResponse(error);
  }
}
