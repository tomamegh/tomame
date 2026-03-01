import { NextRequest } from "next/server";
import { createOrderSchema } from "@/features/orders/schema";
import { createOrder, getUserOrders } from "@/features/orders/orders.service";
import { getAuthenticatedUser } from "@/features/auth/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createClient } from "@/lib/supabase/server";
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
    if (!auth.ok) throw new APIError(auth.status, auth.error);

    const supabase = await createClient();
    const result = await createOrder(supabase, auth.user, {
      productUrl: parsed.data.productUrl,
      productName: parsed.data.productName,
      productImageUrl: parsed.data.productImageUrl,
      estimatedPriceUsd: parsed.data.estimatedPriceUsd,
      quantity: parsed.data.quantity,
      originCountry: parsed.data.originCountry,
      specialInstructions: parsed.data.specialInstructions,
      needsReview: parsed.data.needsReview,
      reviewReasons: parsed.data.reviewReasons,
      extractionMetadata: parsed.data.extractionMetadata,
    });
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!auth.ok) throw new APIError(auth.status, auth.error);

    const result = await getUserOrders(auth.user.id);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}
