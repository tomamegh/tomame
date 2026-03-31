import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, errorResponse, APIError } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, action, entity_type, metadata, created_at")
      .eq("actor_id", auth.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      throw new APIError(500, "Failed to fetch activity");
    }

    return successResponse(data ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}
