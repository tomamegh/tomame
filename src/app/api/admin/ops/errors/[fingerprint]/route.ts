import type { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { resolveErrorIssue } from "@/db/queries/error-events";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/ops/errors/:fingerprint — "I have looked at this one."
 *
 * Not a delete: the row stays with its history and a later occurrence reopens
 * it automatically (the RPC in 062 clears `resolved_at`), so filing something
 * that is still happening does not hide it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ fingerprint: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-ops-errors:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const user = await getAuthenticatedUser();
    const admin = requireAdmin(requireAuth(user));

    const { fingerprint } = await params;
    if (!/^[0-9a-f]{32}$/.test(fingerprint)) throw new APIError(400, "Invalid issue id");

    const resolved = await resolveErrorIssue(fingerprint, admin.id);
    if (resolved) {
      await logAuditEvent({
        actorId: admin.id,
        actorRole: "admin",
        action: "error_issue_resolved",
        entityType: "job",
        entityId: null,
        metadata: { fingerprint },
      });
    }
    return successResponse({ fingerprint, resolved });
  } catch (error) {
    return errorResponse(error);
  }
}
