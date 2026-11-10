import type { NextRequest } from "next/server";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { bulkReceiveSchema } from "@/features/warehouse/schema";
import { receiveWarehouseItems } from "@/features/warehouse/services/warehouse.service";

/** `POST /api/warehouse/items/receive` — `{ order_ids }`: log several parcels in at once (098). */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const parsed = bulkReceiveSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await receiveWarehouseItems(user, parsed.data.order_ids));
  } catch (error) {
    return errorResponse(error);
  }
}
