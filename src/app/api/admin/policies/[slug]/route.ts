import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { deletePolicy, updatePolicy } from "@/features/policies/services/policies.service";

/**
 * Edit or remove one policy. Auth, rate limit, validation and status codes only —
 * the writes and the audit rows they owe are
 * `features/policies/services/policies.service`.
 */
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
    const admin = requireAdmin(auth);

    const { slug } = await params;

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = updatePolicySchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const policy = await updatePolicy(
      { id: admin.id, email: admin.email ?? null },
      slug,
      parsed.data,
    );

    return successResponse(policy);
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
    const admin = requireAdmin(auth);

    const { slug } = await params;

    await deletePolicy({ id: admin.id, email: admin.email ?? null }, slug);

    return successResponse({ slug });
  } catch (error) {
    return errorResponse(error);
  }
}
