import { NextRequest } from "next/server";
import { createOrderSchema } from "@/features/orders/schema";
import { createOrder, listUserOrders } from "@/features/orders/services/orders.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { requireContactDetails } from "@/features/account/services/contact-details.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveViewer } from "@/lib/quote-session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * THE order-creation endpoint. `POST /api/orders/new` was a byte-for-byte
 * duplicate of this handler (data map §"Existing defects" 4) and is gone: no
 * caller referenced it, and two routes writing orders is one place for the
 * rate limit, the lock consumption or the validation to drift.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`orders-create:${ip}`, RATE_LIMIT.orders)).allowed) {
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
    requireContactDetails(auth);

    // The rate lock is resolved from the session, never from the body.
    const { viewer } = resolveViewer(request, auth.id);
    // Service role: customers have no INSERT on orders (migration 076). The row
    // is built server-side from the extraction snapshot, with user_id = auth.id.
    const data = await createOrder(createAdminClient(), auth, parsed.data, viewer);

    return successResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * The viewer's orders, WITH the count.
 *
 * This used to destructure `.orders` off the service result and answer with a
 * bare array, throwing `count` away. The Journeys screen's filter pills are
 * grouped counts over the same list, so the envelope the service already returns
 * is the shape callers need — `{ orders, count }`, not `Order[]`.
 */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const supabase = await createClient();
    const orderList = await listUserOrders(supabase, auth);

    return successResponse(orderList);
  } catch (error) {
    return errorResponse(error);
  }
}
