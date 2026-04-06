import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { updateCategoryMappingSchema } from "@/features/pricing/schema";

type RouteContext = { params: Promise<{ category: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { category } = await context.params;
    const decodedCategory = decodeURIComponent(category);

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-category-mappings:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const body = await request.json();
    const parsed = updateCategoryMappingSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { pricing_group_id } = parsed.data;
    const client = createAdminClient();

    // Validate pricing group exists
    const { data: group } = await client
      .from("pricing_groups")
      .select("id, slug")
      .eq("id", pricing_group_id)
      .single();

    if (!group) throw new APIError(404, "Pricing group not found");

    // Upsert the mapping
    const { error } = await client
      .from("category_pricing_map")
      .upsert(
        {
          tomame_category: decodedCategory,
          pricing_group_id,
          updated_at: new Date().toISOString(),
          updated_by: admin.id,
        },
        { onConflict: "tomame_category" },
      );

    if (error) throw new APIError(500, error.message);

    await logAuditEvent({
      actorId: admin.id,
      actorRole: "admin",
      action: "category_mapping_updated",
      entityType: "order",
      entityId: null,
      metadata: {
        tomame_category: decodedCategory,
        pricing_group_id,
        pricing_group_slug: group.slug,
      },
    });

    return successResponse({ message: `Mapping updated for "${decodedCategory}"` });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { category } = await context.params;
    const decodedCategory = decodeURIComponent(category);

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-category-mappings:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const client = createAdminClient();

    const { data: existing } = await client
      .from("category_pricing_map")
      .select("id, pricing_group_id")
      .eq("tomame_category", decodedCategory)
      .single();

    if (!existing) throw new APIError(404, "Category mapping not found");

    const { error } = await client
      .from("category_pricing_map")
      .delete()
      .eq("tomame_category", decodedCategory);

    if (error) throw new APIError(500, error.message);

    await logAuditEvent({
      actorId: admin.id,
      actorRole: "admin",
      action: "category_mapping_removed",
      entityType: "order",
      entityId: null,
      metadata: {
        tomame_category: decodedCategory,
        previous_group_id: existing.pricing_group_id,
      },
    });

    return successResponse({ message: `Mapping removed for "${decodedCategory}"` });
  } catch (error) {
    return errorResponse(error);
  }
}
