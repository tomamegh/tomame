import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/features/audit/services/audit.service";

const updateProfileSchema = z.object({
  first_name: z.string().max(255, "First name must be 255 characters or less").optional(),
  last_name: z.string().max(255, "Last name must be 255 characters or less").optional(),
  bio: z.string().max(500, "Bio must be 500 characters or less").optional(),
});

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    return successResponse(auth);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .update(parsed.data)
      .eq("id", auth.id)
      .select()
      .single();

    if (error) {
      throw new APIError(500, "Failed to update profile");
    }

    await logAuditEvent({
      actorId: auth.id,
      actorRole: auth.profile.role,
      action: "user_profile_updated",
      entityType: "user",
      entityId: auth.id,
    });

    return successResponse({ profile: data });
  } catch (error) {
    return errorResponse(error);
  }
}
