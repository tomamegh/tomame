import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { bulkCategoryMappingSchema } from "@/features/pricing/schema";

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-category-mappings:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const client = createAdminClient();

    const { data: mappings, error } = await client
      .from("category_pricing_map")
      .select(`
        id,
        tomame_category,
        pricing_group_id,
        updated_at,
        pricing_groups!inner ( id, slug, name )
      `)
      .order("tomame_category");

    if (error) throw new APIError(500, error.message);

    return successResponse({ mappings: mappings ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-category-mappings:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const body = await request.json();
    const parsed = bulkCategoryMappingSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { mappings } = parsed.data;
    const client = createAdminClient();

    // Validate all pricing_group_ids exist
    const groupIds = [...new Set(mappings.map((m) => m.pricing_group_id))];
    const { data: groups, error: groupError } = await client
      .from("pricing_groups")
      .select("id")
      .in("id", groupIds);

    if (groupError) throw new APIError(500, groupError.message);

    const existingIds = new Set((groups ?? []).map((g) => g.id));
    const invalidIds = groupIds.filter((id) => !existingIds.has(id));
    if (invalidIds.length > 0) {
      throw new APIError(400, `Invalid pricing group IDs: ${invalidIds.join(", ")}`);
    }

    // Upsert mappings
    const rows = mappings.map((m) => ({
      tomame_category: m.tomame_category,
      pricing_group_id: m.pricing_group_id,
      updated_at: new Date().toISOString(),
      updated_by: admin.id,
    }));

    const { error: upsertError } = await client
      .from("category_pricing_map")
      .upsert(rows, { onConflict: "tomame_category" });

    if (upsertError) throw new APIError(500, upsertError.message);

    await logAuditEvent({
      actorId: admin.id,
      actorRole: "admin",
      action: "category_mappings_bulk_updated",
      entityType: "order",
      entityId: null,
      metadata: {
        count: mappings.length,
        categories: mappings.map((m) => m.tomame_category),
      },
    });

    return successResponse({ message: `${mappings.length} mappings updated` });
  } catch (error) {
    return errorResponse(error);
  }
}
