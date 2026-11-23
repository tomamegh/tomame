import type { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { listWindowPrefs } from "@/features/warehouse/services/shipment.service";

const bodySchema = z.object({
  package_ids: z.array(z.uuid()).max(200).default([]),
  order_ids: z.array(z.uuid()).max(500).default([]),
});

/** `POST /api/warehouse/shipments/window-prefs` — customers' preferred delivery windows for what is selected (125). */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "read");
    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await listWindowPrefs(user, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
