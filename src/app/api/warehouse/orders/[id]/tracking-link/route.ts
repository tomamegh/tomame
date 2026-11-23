import type { NextRequest } from "next/server";
import * as z from "zod";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse } from "@/lib/auth/warehouse-route";
import { clearStoreTrackingLink } from "@/features/warehouse/services/store-link.service";

/** `DELETE /api/warehouse/orders/:id/tracking-link` — take a wrong store tracking link (141) off the order. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new APIError(400, "Invalid order");
    await clearStoreTrackingLink(user, id.data);
    return successResponse({ cleared: true });
  } catch (error) {
    return errorResponse(error);
  }
}
