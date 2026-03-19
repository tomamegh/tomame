import { NextRequest } from "next/server";
import { getOrderAuditHistory } from "@/features/orders/services/orders.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, errorResponse } from "@/lib/auth/api-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const { id } = await params;
    const data = await getOrderAuditHistory(auth, id);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
