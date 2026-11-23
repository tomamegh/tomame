import type { NextRequest } from "next/server";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { addOrdersTrackingSchema } from "@/features/warehouse/schema";
import { addOrdersStoreTracking } from "@/features/warehouse/services/order-tracking.service";

/**
 * `POST /api/warehouse/orders/tracking` — store tracking added after purchase,
 * to one order or many. Lists what was saved and what was refused, by name.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const parsed = addOrdersTrackingSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    const result = await addOrdersStoreTracking(user, parsed.data);
    if (result.added.length === 0) throw new APIError(400, result.refused[0]?.reason ?? "Nothing was saved");
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
