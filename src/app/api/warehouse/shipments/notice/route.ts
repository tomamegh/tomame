import type { NextRequest } from "next/server";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { shipmentNoticeSchema } from "@/features/shipments/schema";
import { postShipmentNotice } from "@/features/warehouse/services/shipment.service";

/** `POST /api/warehouse/shipments/notice` — post (or clear, `clear: true`) a delay notice (098). */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const parsed = shipmentNoticeSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await postShipmentNotice(user, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
