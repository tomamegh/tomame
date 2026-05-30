import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

const createPolicySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, or hyphens"),
  label: z.string().trim().min(1).max(128),
  content: z.string().default(""),
  effective_date: z.string().trim().max(64).optional(),
  is_published: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = createPolicySchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from("policies")
      .insert({
        slug: parsed.data.slug,
        label: parsed.data.label,
        content: parsed.data.content,
        effective_date: parsed.data.effective_date ?? null,
        is_published: parsed.data.is_published,
      })
      .select("id, slug, label, content, effective_date, last_updated, is_published")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new APIError(409, `A policy with slug "${parsed.data.slug}" already exists`);
      }
      throw error;
    }

    return successResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
