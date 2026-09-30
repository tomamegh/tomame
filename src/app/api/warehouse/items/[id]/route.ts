import type { NextRequest } from "next/server";

import { errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { authenticateWarehouse } from "@/lib/auth/warehouse-route";
import { getWarehouseItem } from "@/features/warehouse/services/warehouse.service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const user = await authenticateWarehouse(request, "read");
    const { id } = await params;
    return successResponse(await getWarehouseItem(user, id));
  } catch (error) {
    return errorResponse(error);
  }
}
