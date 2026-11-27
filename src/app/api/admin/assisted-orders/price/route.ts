import { NextRequest } from "next/server";

import { assistedPriceSchema } from "@/features/assisted-orders/schema";
import { priceQuoteForCustomer } from "@/features/assisted-orders/services/assisted-order.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { jsonBody, requireAssistedOrderAdmin } from "../_guard";

/** POST /api/admin/assisted-orders/price — a buyer sets the store's price on a quote. */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAssistedOrderAdmin(request);
    const parsed = assistedPriceSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await priceQuoteForCustomer(admin.id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
