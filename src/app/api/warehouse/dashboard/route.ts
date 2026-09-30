import type { NextRequest } from "next/server";

import { errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { authenticateWarehouse } from "@/lib/auth/warehouse-route";
import { getWarehouseDashboard } from "@/features/warehouse/services/warehouse.service";

/** `GET /api/warehouse/dashboard` — counts, packages on the bench, the next job. */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "read");
    return successResponse(await getWarehouseDashboard(user));
  } catch (error) {
    return errorResponse(error);
  }
}
