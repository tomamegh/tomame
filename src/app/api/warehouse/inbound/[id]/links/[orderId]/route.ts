import type { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse } from "@/lib/auth/warehouse-route";
import { unlinkInboundOrder } from "@/features/warehouse/services/inbound.service";

type Ctx = { params: Promise<{ id: string; orderId: string }> };

/** `DELETE /api/warehouse/inbound/:id/links/:orderId` — a wrong link, undone (086). */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const { id, orderId } = await params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(orderId).success) {
      throw new APIError(404, "Parcel not found");
    }
    return successResponse({ parcel: await unlinkInboundOrder(user, id, orderId) });
  } catch (error) {
    return errorResponse(error);
  }
}
