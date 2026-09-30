import type { NextRequest } from "next/server";

import { APIError, errorResponse } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { pageViewSchema } from "@/features/warehouse/activity-schema";
import { recordWarehousePageView } from "@/features/warehouse/services/activity.service";

/**
 * `POST /api/warehouse/activity` — `{ path }` from the shell's beacon (082).
 *
 * Its own rate-limit bucket, so page views never spend the budget a scan needs.
 * 204 either way once validated: the recorder never throws, and a beacon has
 * nobody to show an error to.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "activity");
    const parsed = pageViewSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    await recordWarehousePageView(user, parsed.data.path);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
