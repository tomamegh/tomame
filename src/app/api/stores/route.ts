import { listEnabledStores } from "@/features/stores/services/stores.service";
import { successResponse, errorResponse, APIError } from "@/lib/auth/api-helpers";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const result = await listEnabledStores(supabase);
    if (!result.success) throw new APIError(500, result.error);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}
