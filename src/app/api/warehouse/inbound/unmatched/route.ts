import type { NextRequest } from "next/server";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { unmatchedInboundSchema } from "@/features/warehouse/schema";
import { logUnmatchedParcel } from "@/features/warehouse/services/inbound.service";

/** `POST /api/warehouse/inbound/unmatched` — a parcel arrived that no order expects (086). */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const parsed = unmatchedInboundSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await logUnmatchedParcel(user, parsed.data), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
