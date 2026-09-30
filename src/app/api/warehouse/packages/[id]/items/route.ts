import type { NextRequest } from "next/server";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { addPackageItemsSchema } from "@/features/warehouse/schema";
import { addWarehousePackageItems } from "@/features/warehouse/services/warehouse.service";

type Ctx = { params: Promise<{ id: string }> };

/** `POST` — put orders (and hand-described lines) in the package. */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const { id } = await params;
    const parsed = addPackageItemsSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await addWarehousePackageItems(user, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
