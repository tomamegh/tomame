import type { NextRequest } from "next/server";

import { errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { authenticateWarehouse } from "@/lib/auth/warehouse-route";
import { listWarehouseItems } from "@/features/warehouse/services/warehouse.service";
import type { ItemStage } from "@/features/warehouse/types";

const STAGES: ItemStage[] = ["awaiting", "received", "packed", "shipped"];

/** `GET /api/warehouse/items?stage=received` — the bench. Unknown stage = all. */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "read");
    const raw = request.nextUrl.searchParams.get("stage");
    const stage = STAGES.find((s) => s === raw);
    return successResponse(await listWarehouseItems(user, { stage }));
  } catch (error) {
    return errorResponse(error);
  }
}
