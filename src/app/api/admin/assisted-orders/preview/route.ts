import { NextRequest } from "next/server";

import { assistedPreviewSchema } from "@/features/assisted-orders/schema";
import { lineViews } from "@/features/assisted-orders/services/assisted-order.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { jsonBody, requireAssistedOrderAdmin } from "../_guard";

/** POST /api/admin/assisted-orders/preview — the screen's lines again (after a variant pick, or to refresh holds). */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAssistedOrderAdmin(request);
    const parsed = assistedPreviewSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await lineViews(admin.id, parsed.data.extraction_cache_ids));
  } catch (error) {
    return errorResponse(error);
  }
}
