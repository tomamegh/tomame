import { NextRequest } from "next/server";
import { cancelOrderByUser } from "@/features/orders/services/orders.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, errorResponse } from "@/lib/auth/api-helpers";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const { id } = await params;
    const data = await cancelOrderByUser(auth, id);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
