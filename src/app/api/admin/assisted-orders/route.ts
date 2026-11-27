import { NextRequest } from "next/server";

import { customerLookupSchema, placeAssistedOrderSchema } from "@/features/assisted-orders/schema";
import { lookupCustomer, placeAssistedOrder } from "@/features/assisted-orders/services/assisted-order.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { jsonBody, requireAssistedOrderAdmin } from "./_guard";

export const maxDuration = 120;

/** GET /api/admin/assisted-orders?email= — the customer's account (if any), addresses and delivery zones. */
export async function GET(request: NextRequest) {
  try {
    await requireAssistedOrderAdmin(request);
    const parsed = customerLookupSchema.safeParse({ email: request.nextUrl.searchParams.get("email") ?? "" });
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await lookupCustomer(parsed.data.email));
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/admin/assisted-orders — place a paid order for a customer under their own account. */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAssistedOrderAdmin(request);
    const parsed = placeAssistedOrderSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await placeAssistedOrder(admin, parsed.data), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
