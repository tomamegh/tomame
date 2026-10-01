import type { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { receiveItemSchema } from "@/features/warehouse/schema";
import { receiveInboundParcel } from "@/features/warehouse/services/inbound.service";

type Ctx = { params: Promise<{ id: string }> };

/** `POST /api/warehouse/inbound/:id/receive` — the parcel is here; log its orders in (086). */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new APIError(404, "Parcel not found");
    const parsed = receiveItemSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await receiveInboundParcel(user, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
