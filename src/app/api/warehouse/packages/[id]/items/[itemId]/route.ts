import type { NextRequest } from "next/server";

import { errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { authenticateWarehouse } from "@/lib/auth/warehouse-route";
import { removeWarehousePackageItem } from "@/features/warehouse/services/warehouse.service";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/** `DELETE` — take one line out of a package that is still open. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const { id, itemId } = await params;
    return successResponse(await removeWarehousePackageItem(user, id, itemId));
  } catch (error) {
    return errorResponse(error);
  }
}
