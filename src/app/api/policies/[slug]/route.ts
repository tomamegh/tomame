import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const db = createAdminClient();
    const { data, error } = await db
      .from("policies")
      .select(
        "id, slug, label, content, effective_date, last_updated, is_published",
      )
      .eq("slug", slug)
      .eq("is_published", true)
      .single();

    if (error || !data) {
      throw new APIError(404, "Policy not found");
    }

    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
