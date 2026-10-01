import type { NextRequest } from "next/server";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { registerInboundSchema } from "@/features/warehouse/schema";
import { registerInboundTracking } from "@/features/warehouse/services/inbound.service";

/** `POST /api/warehouse/inbound` — put a store's tracking number on an order (086). */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const parsed = registerInboundSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await registerInboundTracking(user, parsed.data), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
