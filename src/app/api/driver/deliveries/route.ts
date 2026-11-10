import type { NextRequest } from "next/server";

import { errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { authenticateDelivery } from "@/lib/auth/warehouse-route";
import { getDriverBoard } from "@/features/drivers/services/driver.service";

/** `GET /api/driver/deliveries` — a driver's stops (staff: every driver's) (102). */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateDelivery(request, "read");
    return successResponse(await getDriverBoard(user));
  } catch (error) {
    return errorResponse(error);
  }
}
