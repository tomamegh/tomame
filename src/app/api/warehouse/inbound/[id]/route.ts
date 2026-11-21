import type { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { correctInboundTrackingSchema } from "@/features/warehouse/schema";
import { updateInboundTrackingNumber } from "@/features/warehouse/services/inbound.service";

type Ctx = { params: Promise<{ id: string }> };

/** `PATCH /api/warehouse/inbound/:id` — correct an expected parcel's tracking number. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new APIError(404, "Parcel not found");
    const parsed = correctInboundTrackingSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await updateInboundTrackingNumber(user, id, parsed.data.tracking_number));
  } catch (error) {
    return errorResponse(error);
  }
}
