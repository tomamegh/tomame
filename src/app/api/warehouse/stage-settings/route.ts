import type { NextRequest } from "next/server";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { stageSettingSchema } from "@/features/shipments/schema";
import {
  getStageSettingsForStaff,
  saveStageSetting,
} from "@/features/warehouse/services/shipment.service";

/** `GET /api/warehouse/stage-settings` — each step's wording and contact (098). */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "read");
    return successResponse(await getStageSettingsForStaff(user));
  } catch (error) {
    return errorResponse(error);
  }
}

/** `PUT /api/warehouse/stage-settings` — one step. Admins only; the service checks. */
export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const parsed = stageSettingSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await saveStageSetting(user, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
