import { NextRequest, after } from "next/server";

import { assistedQuoteSchema } from "@/features/assisted-orders/schema";
import { quoteLinkForCustomer } from "@/features/assisted-orders/services/assisted-order.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { jsonBody, requireAssistedOrderAdmin } from "../_guard";

// Chain budget is 25 s, 60 s for SHEIN; same headroom as the customer's paste.
export const maxDuration = 120;

/** POST /api/admin/assisted-orders/quote — read a link for a customer's order. */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAssistedOrderAdmin(request);
    const parsed = assistedQuoteSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    const { line, enrich } = await quoteLinkForCustomer(admin.id, parsed.data.product_url);
    if (enrich) after(enrich);
    return successResponse(line);
  } catch (error) {
    return errorResponse(error);
  }
}
