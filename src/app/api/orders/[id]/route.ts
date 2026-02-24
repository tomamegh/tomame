import { NextRequest } from "next/server";
import { getOrder } from "@/features/orders/orders.service";
import { getAuthenticatedUser } from "@/features/auth/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import {
  APIError,
  successResponse,
  errorResponse,
} from "@/lib/auth/api-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!auth.ok) throw new APIError(auth.status, auth.error);

    const { id } = await params;
    const result = await getOrder(auth.user, id);
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}
