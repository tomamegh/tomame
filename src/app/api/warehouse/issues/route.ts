import type { NextRequest } from "next/server";

import { errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { authenticateWarehouse } from "@/lib/auth/warehouse-route";
import type { OrderFeedbackStatus } from "@/db/queries/order-feedback";
import { listWarehouseIssues } from "@/features/warehouse/services/warehouse.service";

const STATUSES: OrderFeedbackStatus[] = ["open", "in_review", "resolved", "dismissed"];

/** `GET /api/warehouse/issues?status=open` — customer objections, with the item. */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "read");
    const raw = request.nextUrl.searchParams.get("status");
    const status = STATUSES.find((s) => s === raw);
    return successResponse(await listWarehouseIssues(user, status));
  } catch (error) {
    return errorResponse(error);
  }
}
