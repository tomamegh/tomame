import { NextRequest, NextResponse } from "next/server";
import { reconcilePendingPayments } from "@/features/payments/services/payment-reconciliation.service";
import { runCronJob } from "@/lib/auth/cron";
import { logger } from "@/lib/logger";

/** Up to 20 Paystack verifies plus a handful of writes; nowhere near the cap. */
export const maxDuration = 120;

/**
 * Payment reconciliation. Called by pg_cron via pg_net every five minutes
 * (migration 059), authenticated with the same bearer `CRON_SECRET` as every
 * other job.
 *
 * WHY THIS EXISTS. The webhook and the browser callback are both deliveries we
 * do not control: Paystack only fires `charge.success` (never "abandoned"), and
 * the callback only runs if the customer comes back to the tab. On production
 * every payment ever created sat `pending` for five days because neither
 * happened. This job asks Paystack directly about every pending payment older
 * than a few minutes, settles what succeeded, records what failed, and releases
 * what was abandoned so the customer can pay again. Then it closes orders and
 * bags nobody has paid for in `unpaid_order_ttl_hours`.
 *
 * A run with unreachable verifies in it is still a 200: those rows stay pending
 * and the next run tries again. What reaches the catch is a broken run.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return runCronJob(request, "reconcile-payments", async () => {
    const summary = await reconcilePendingPayments();
    if (summary.checked || summary.ordersCancelled || summary.groupsCancelled) {
      logger.info("reconcile-payments run", { ...summary });
    }
    return { ...summary };
  });
}
