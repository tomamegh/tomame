import { NextRequest } from "next/server";
import { createOrderSchema } from "@/features/orders/schema";
import { createOrder, listUserOrders } from "@/features/orders/services/orders.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/quote-session";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`orders-create:${ip}`, RATE_LIMIT.orders).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const supabase = await createClient();
    // The rate lock is resolved from the session, never from the body.
    const { viewer } = resolveViewer(request, auth.id);
    const data = await createOrder(supabase, auth, parsed.data, viewer);

    return successResponse(data, 201);
  } catch (error) {
    console.log(error)
    return errorResponse(error);
  }
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const supabase = await createClient();
    const { orders } = await listUserOrders(supabase, auth);

    return successResponse(orders);
  } catch (error) {
    return errorResponse(error);
  }
}
