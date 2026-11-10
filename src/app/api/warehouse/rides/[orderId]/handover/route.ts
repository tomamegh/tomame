import type { NextRequest } from "next/server";

import { errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { authenticateWarehouse } from "@/lib/auth/warehouse-route";
import { handOverCustomerRide } from "@/features/order-delivery/services/customer-ride.service";

type Ctx = { params: Promise<{ orderId: string }> };

/** `POST /api/warehouse/rides/:orderId/handover` — the customer's rider collected it (101). */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const { orderId } = await params;
    const result = await handOverCustomerRide(user, orderId);
    return successResponse({ action: result.action, notification: result.notification });
  } catch (error) {
    return errorResponse(error);
  }
}
