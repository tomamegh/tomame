import { NextRequest } from "next/server";
import { createOrderSchema } from "@/features/orders/schema";
import { createOrder, getUserOrders } from "@/features/orders/services/orders.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import {
  APIError,
  successResponse,
  errorResponse,
} from "@/lib/auth/api-helpers";
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
    const {
      success,
      data,
      error: validationError,
    } = createOrderSchema.safeParse(body);
    if (!success || validationError) {
      throw new APIError(
        400,
        validationError.issues[0]?.message ?? "Invalid input",
      );
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!auth.ok) throw new APIError(auth.status, auth.error);

    const supabase = await createClient();
    const result = await createOrder(supabase, auth.user, {
      productUrl: data.productUrl,
      productName: data.productName,
      productImageUrl: data.productImageUrl,
      estimatedPriceUsd: data.estimatedPriceUsd,
      quantity: data.quantity,
      originCountry: data.originCountry,
      specialInstructions: data.specialInstructions,
      needsReview: data.needsReview,
      reviewReasons: data.reviewReasons,
      extractionMetadata: data.extractionMetadata,
      extractionData: data.extractionData,
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
