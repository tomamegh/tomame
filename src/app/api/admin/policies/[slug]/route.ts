import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const updatePolicySchema = z.object({
  content: z.string(),
  is_published: z.boolean(),
  effective_date: z.string().trim().min(1).max(64).nullish(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-policies:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const { slug } = await params;

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = updatePolicySchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from("policies")
      .update({
        content: parsed.data.content,
        is_published: parsed.data.is_published,
        effective_date: parsed.data.effective_date ?? null,
        last_updated: new Date().toISOString(),
      })
      .eq("slug", slug)
      .select(
        "id, slug, label, content, effective_date, last_updated, is_published",
      )
      .single();

    if (error || !data) {
      throw new APIError(404, "Policy not found");
    }

    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const { slug } = await params;

    const db = createAdminClient();
    const { error } = await db.from("policies").delete().eq("slug", slug);

    if (error) throw new APIError(500, error.message);

    return successResponse({ slug });
  } catch (error) {
    return errorResponse(error);
  }
}
