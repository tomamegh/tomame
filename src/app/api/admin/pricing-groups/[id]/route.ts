import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { updatePricingGroupSchema } from "@/features/pricing/schema";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-pricing-groups:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const client = createAdminClient();

    const { data: group, error } = await client
      .from("pricing_groups")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !group) throw new APIError(404, "Pricing group not found");

    // Fetch mapped categories
    const { data: mappings } = await client
      .from("category_pricing_map")
      .select("tomame_category")
      .eq("pricing_group_id", id);

    return successResponse({
      ...group,
      categories: (mappings ?? []).map((m) => m.tomame_category),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-pricing-groups:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const body = await request.json();
    const parsed = updatePricingGroupSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const input = parsed.data;
    const client = createAdminClient();

    // Fetch current for audit
    const { data: current } = await client
      .from("pricing_groups")
      .select("*")
      .eq("id", id)
      .single();

    if (!current) throw new APIError(404, "Pricing group not found");

    // Build update payload — only include provided fields
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: admin.id,
    };
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updatePayload[key] = value;
      }
    }

    const { data: updated, error } = await client
      .from("pricing_groups")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new APIError(500, error.message);

    await logAuditEvent({
      actorId: admin.id,
      actorRole: "admin",
      action: "pricing_group_updated",
      entityType: "order",
      entityId: id,
      metadata: {
        slug: current.slug,
        changes: input,
      },
    });

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-pricing-groups:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const client = createAdminClient();

    const { data: current } = await client
      .from("pricing_groups")
      .select("id, slug, is_active")
      .eq("id", id)
      .single();

    if (!current) throw new APIError(404, "Pricing group not found");

    // Soft delete
    const { error } = await client
      .from("pricing_groups")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
        updated_by: admin.id,
      })
      .eq("id", id);

    if (error) throw new APIError(500, error.message);

    await logAuditEvent({
      actorId: admin.id,
      actorRole: "admin",
      action: "pricing_group_deactivated",
      entityType: "order",
      entityId: id,
      metadata: { slug: current.slug },
    });

    return successResponse({ message: "Pricing group deactivated" });
  } catch (error) {
    return errorResponse(error);
  }
}
