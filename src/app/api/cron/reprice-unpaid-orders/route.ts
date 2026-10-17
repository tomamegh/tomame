import { NextRequest, NextResponse } from "next/server";

import { repriceUnpaidOrders } from "@/features/orders/services/order-reprice.service";
import { runCronJob } from "@/lib/auth/cron";

export const maxDuration = 120;

/**
 * Re-price checked-out, unpaid orders to the current admin pricing (096). An
 * admin pricing save already does this in `after()`; this catches a lost run
 * and the orders whose payment was open at the time. A no-op when nothing
 * changed.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return runCronJob(request, "reprice-unpaid-orders", async () => ({ ...(await repriceUnpaidOrders({ actorId: null, reason: "cron" })) }));
}
