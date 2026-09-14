import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createPolicy } from "@/features/policies/services/policies.service";

/**
 * Create one policy. Auth, validation and status codes only — the write and the
 * audit row it owes are `features/policies/services/policies.service`.
 */
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
    const admin = requireAdmin(auth);

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = createPolicySchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const policy = await createPolicy(
      { id: admin.id, email: admin.email ?? null },
      parsed.data,
    );

    return successResponse(policy, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
