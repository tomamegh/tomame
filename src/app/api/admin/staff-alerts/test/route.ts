import type { NextRequest } from "next/server";

import { AUDIT_ENTITY_TYPES } from "@/config/constants";
import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { sendStaffTestEmail } from "@/features/staff-alerts/staff-alerts.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * `POST /api/admin/staff-alerts/test` — one test email to the staff list as
 * saved. Tighter limit than the rest of /api/admin: this sends real mail.
 */
const TEST_LIMIT = { windowMs: 15 * 60 * 1000, maxRequests: 5 };

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`admin-staff-alerts-test:${ip}`, TEST_LIMIT)).allowed) {
      throw new APIError(429, "Too many test emails. Try again in a few minutes.");
    }
    if (!(await checkRateLimit(`admin-staff-alerts:${ip}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const admin = requireAdmin(requireAuth(await getAuthenticatedUser()));
    const result = await sendStaffTestEmail(admin.email ?? "An admin");
    await logAuditEvent({
      actorId: admin.id,
      actorRole: "admin",
      action: "staff_alert_test_sent",
      entityType: AUDIT_ENTITY_TYPES.SITE_SETTING,
      entityId: null,
      metadata: { key: "staff_order_alert_recipients", result },
    });
    if (result.status === "failed") throw new APIError(502, `The test email was not delivered: ${result.error}`);
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
