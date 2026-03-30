import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { z } from "zod";

const patchSchema = z.object({
  key: z.string().min(1),
  value: z.number().nonnegative("Value must be non-negative"),
});

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-pricing-constants:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const client = createAdminClient();
    const { data, error } = await client
      .from("pricing_constants")
      .select("id, key, value, label, description, unit, updated_at, updated_by")
      .order("key");

    if (error) throw new APIError(500, error.message);

    return successResponse({ constants: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-pricing-constants:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { key, value } = parsed.data;
    const client = createAdminClient();

    // Fetch current value for audit
    const { data: current } = await client
      .from("pricing_constants")
      .select("*")
      .eq("key", key)
      .single();

    if (!current) {
      throw new APIError(404, `Pricing constant "${key}" not found`);
    }

    const { data: updated, error } = await client
      .from("pricing_constants")
      .update({ value, updated_at: new Date().toISOString(), updated_by: admin.id })
      .eq("key", key)
      .select()
      .single();

    if (error) throw new APIError(500, error.message);

    await logAuditEvent({
      actorId: admin.id,
      actorRole: "admin",
      action: "pricing_constant_updated",
      entityType: "order",
      entityId: updated.id,
      metadata: {
        key,
        previousValue: current.value,
        newValue: value,
      },
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
