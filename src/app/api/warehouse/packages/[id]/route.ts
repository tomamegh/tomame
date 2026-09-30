import type { NextRequest } from "next/server";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { packageDetailsSchema } from "@/features/warehouse/schema";
import {
  deleteWarehousePackage,
  getWarehousePackage,
  updateWarehousePackage,
} from "@/features/warehouse/services/warehouse.service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const user = await authenticateWarehouse(request, "read");
    const { id } = await params;
    return successResponse(await getWarehousePackage(user, id));
  } catch (error) {
    return errorResponse(error);
  }
}

/** `PATCH` — weight, dimensions, handling marks, waybill, notes. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const { id } = await params;
    const parsed = packageDetailsSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await updateWarehousePackage(user, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}

/** `DELETE` — only while still packing; the items go back on the bench. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const { id } = await params;
    await deleteWarehousePackage(user, id);
    return successResponse({ deleted: id });
  } catch (error) {
    return errorResponse(error);
  }
}
