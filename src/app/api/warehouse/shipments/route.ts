import type { NextRequest } from "next/server";

import { errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { authenticateWarehouse } from "@/lib/auth/warehouse-route";
import { getShipmentBoard } from "@/features/warehouse/services/shipment.service";

/** `GET /api/warehouse/shipments` — shipped packages and loose in-transit orders, by step (098). */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "read");
    return successResponse(await getShipmentBoard(user));
  } catch (error) {
    return errorResponse(error);
  }
}
