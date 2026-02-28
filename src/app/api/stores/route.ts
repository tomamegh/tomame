import { listEnabledStores } from "@/features/stores/stores.service";
import { successResponse, errorResponse, APIError } from "@/lib/auth/api-helpers";

export async function GET() {
  try {
    const result = await listEnabledStores();
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}
