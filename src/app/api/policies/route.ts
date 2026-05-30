import { createAdminClient } from "@/lib/supabase/admin";
import { successResponse, errorResponse } from "@/lib/auth/api-helpers";

export async function GET() {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("policies")
      .select(
        "id, slug, label, content, effective_date, last_updated, is_published",
      )
      .eq("is_published", true)
      .order("slug");

    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
