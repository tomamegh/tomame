import type { NextRequest } from "next/server";

import { errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { authenticateWarehouse } from "@/lib/auth/warehouse-route";
import { deleteEmptyWarehousePackages } from "@/features/warehouse/services/warehouse.service";

/** `POST /api/warehouse/packages/cleanup` — delete every empty package left packing for a day or more (112). */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "write");
    return successResponse({ deleted: await deleteEmptyWarehousePackages(user) });
  } catch (error) {
    return errorResponse(error);
  }
}
