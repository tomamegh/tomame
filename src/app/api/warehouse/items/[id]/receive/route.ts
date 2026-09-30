import type { NextRequest } from "next/server";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { receiveItemSchema } from "@/features/warehouse/schema";
import { receiveWarehouseItem } from "@/features/warehouse/services/warehouse.service";

type Ctx = { params: Promise<{ id: string }> };

/** `POST /api/warehouse/items/:id/receive` — log a parcel in at the hub, with its weight. */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const { id } = await params;
    const parsed = receiveItemSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await receiveWarehouseItem(user, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
