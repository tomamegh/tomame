import { NextRequest, NextResponse } from "next/server";

import { notifyRepricedTotals } from "@/features/orders/services/order-reprice-notify.service";
import { repriceUnpaidOrders } from "@/features/orders/services/order-reprice.service";
import { runCronJob } from "@/lib/auth/cron";

export const maxDuration = 120;

/**
 * Re-price checked-out, unpaid orders to the current admin pricing (096). An
 * admin pricing save already does this in `after()`; this catches a lost run
 * and the orders whose payment was open at the time. A no-op when nothing
 * changed. It then tells customers whose total has settled at a new figure
 * (order-reprice-notify.service.ts).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return runCronJob(request, "reprice-unpaid-orders", async () => {
    const repriced = await repriceUnpaidOrders({ actorId: null, reason: "cron" });
    // After the pass, so a total this run moved is not told until it has settled.
    const { notified } = await notifyRepricedTotals();
    return { ...repriced, customersNotified: notified };
  });
}
