import type { NextRequest } from "next/server";
import { z } from "zod";

import { RATE_LIMIT } from "@/config/security";
import { completeDelivery } from "@/features/drivers/services/driver.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { authenticateDelivery, readJson } from "@/lib/auth/warehouse-route";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  order_ids: z.array(z.uuid()).min(1, "Choose a parcel").max(50),
  code: z.string().trim().min(1, "Type the customer's code").max(20),
});

/**
 * `POST /api/driver/deliveries/complete` — `{ order_ids, code }` (102). The
 * customer's code proves the hand-over. Rate limited per person as well as per
 * address, on top of the five-try lock, so a code cannot be walked.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateDelivery(request, "write");
    if (!(await checkRateLimit(`driver-complete:${user.id}`, RATE_LIMIT.general)).allowed) {
      throw new APIError(429, "Too many tries. Wait a minute.");
    }
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await completeDelivery(user, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
