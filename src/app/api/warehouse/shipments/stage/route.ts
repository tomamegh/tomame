import type { NextRequest } from "next/server";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { moveShipmentsSchema } from "@/features/shipments/schema";
import { moveShipments } from "@/features/warehouse/services/shipment.service";

/**
 * `POST /api/warehouse/shipments/stage` — move packages and/or loose orders to
 * a step (098). Every order inside moves; the answer lists any that could not.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const parsed = moveShipmentsSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await moveShipments(user, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
