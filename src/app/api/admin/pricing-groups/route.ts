import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { createPricingGroupSchema } from "@/features/pricing/schema";

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-pricing-groups:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const client = createAdminClient();

    // Fetch pricing groups with mapped category count
    const { data: groups, error } = await client
      .from("pricing_groups")
      .select("*")
      .order("sort_order");

    if (error) throw new APIError(500, error.message);

    // Fetch category counts per group
    const { data: mappings, error: mapError } = await client
      .from("category_pricing_map")
      .select("pricing_group_id");

    if (mapError) throw new APIError(500, mapError.message);

    const countByGroup = new Map<string, number>();
    for (const m of mappings ?? []) {
      countByGroup.set(m.pricing_group_id, (countByGroup.get(m.pricing_group_id) ?? 0) + 1);
    }

    const result = (groups ?? []).map((g) => ({
      ...g,
      category_count: countByGroup.get(g.id) ?? 0,
    }));

    return successResponse({ groups: result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-pricing-groups:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const body = await request.json();
    const parsed = createPricingGroupSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const input = parsed.data;
    const client = createAdminClient();

    // Check slug uniqueness
    const { data: existing } = await client
      .from("pricing_groups")
      .select("id")
      .eq("slug", input.slug)
      .single();

    if (existing) {
      throw new APIError(409, `A pricing group with slug "${input.slug}" already exists`);
    }

    const { data: created, error } = await client
      .from("pricing_groups")
      .insert({
        slug: input.slug,
        name: input.name,
        flat_rate_ghs: input.flat_rate_ghs ?? null,
        flat_rate_expression: input.flat_rate_expression ?? null,
        value_percentage: input.value_percentage,
        value_percentage_high: input.value_percentage_high ?? null,
        value_threshold_usd: input.value_threshold_usd ?? null,
        default_weight_lbs: input.default_weight_lbs ?? null,
        requires_weight: input.requires_weight,
        sort_order: input.sort_order,
        updated_by: admin.id,
      })
      .select()
      .single();

    if (error) throw new APIError(500, error.message);

    await logAuditEvent({
      actorId: admin.id,
      actorRole: "admin",
      action: "pricing_group_created",
      entityType: "order",
      entityId: created.id,
      metadata: { slug: input.slug, name: input.name },
    });

    return successResponse(created, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
