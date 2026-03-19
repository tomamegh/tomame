import { NextRequest } from "next/server";
import { getOrder } from "@/features/orders/services/orders.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const supabase = await createClient();
    const { id } = await params;
    const data = await getOrder(supabase, auth, id);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
