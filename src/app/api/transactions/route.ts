import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { listUserTransactions } from "@/features/payments/services/payments.service";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!auth.ok) throw new APIError(auth.status, auth.error);

    const supabase = await createClient();
    const data = await listUserTransactions(supabase, auth.user);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
