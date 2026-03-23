import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const authUser = requireAuth(user);

    const { id } = await params;

    const db = createAdminClient();
    const { data, error } = await db
      .from("extraction_cache")
      .select("id, product_url, result, is_valid, expires_at")
      .eq("id", id)
      .eq("user_id", authUser.id)
      .eq("is_valid", true)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !data) {
      throw new APIError(404, "Extraction not found or expired");
    }

    return successResponse({
      extraction_cache_id: data.id,
      product_url: data.product_url,
      ...data.result,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
