import type { NextRequest } from "next/server";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { lookupSchema } from "@/features/warehouse/schema";
import { lookupWarehouseCode } from "@/features/warehouse/services/warehouse.service";

/** `POST /api/warehouse/lookup` — `{ code }` from a scanner, a camera or a thumb. */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "read");
    const parsed = lookupSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await lookupWarehouseCode(user, parsed.data.code));
  } catch (error) {
    return errorResponse(error);
  }
}
