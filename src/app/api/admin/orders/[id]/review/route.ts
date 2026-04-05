import { NextRequest } from "next/server";
import { reviewOrderSchema } from "@/features/orders/schema";
import { reviewOrder } from "@/features/orders/services/orders.review.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-orders:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = reviewOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const client  = await createClient();
    const {data: adminData, error} = await client.auth.getClaims()

    const admin = adminData?.claims;

    console.log(admin)

    if (error|| !admin) {
      throw new APIError(403, "Admin access required");
    }

    
    const { id } = await params;
    const data = await reviewOrder(client, admin, id, parsed.data);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
