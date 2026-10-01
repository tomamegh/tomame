import type { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { staffAlertSettingsSchema } from "@/features/staff-alerts/settings";
import { getStaffAlertSettingsView, updateStaffAlertSettings } from "@/features/staff-alerts/staff-alerts-admin.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * `/api/admin/staff-alerts` — who gets the staff order emails and which
 * events they cover (087). GET reads, PUT replaces both. HTTP only: rate
 * limit, admin check, body validation; the write and its audit rows are
 * `staff-alerts-admin.service.ts`.
 */

async function guard(request: NextRequest) {
  const ip = getClientIp(request);
  if (!(await checkRateLimit(`admin-staff-alerts:${ip}`, RATE_LIMIT.admin)).allowed) {
    throw new APIError(429, "Too many requests");
  }
  return requireAdmin(requireAuth(await getAuthenticatedUser()));
}

export async function GET(request: NextRequest) {
  try {
    await guard(request);
    return successResponse(await getStaffAlertSettingsView());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await guard(request);
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = staffAlertSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    return successResponse(await updateStaffAlertSettings(parsed.data, { id: admin.id, email: admin.email ?? null }));
  } catch (error) {
    return errorResponse(error);
  }
}
