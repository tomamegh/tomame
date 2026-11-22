import { NextRequest, NextResponse } from "next/server";
import { dispatchDueWhatsApp } from "@/features/notifications/services/whatsapp.service";
import { retryOrderPlacedNotifications } from "@/features/orders/services/orders.service";
import { runCronJob } from "@/lib/auth/cron";
import { logger } from "@/lib/logger";

/** Twenty Meta calls at a 10 s timeout each is the worst case. */
export const maxDuration = 300;

/**
 * WhatsApp dispatch. pg_cron → pg_net every minute (migration 079), bearer
 * `CRON_SECRET` like every other job. Sends one small batch of pending
 * WhatsApp notifications and retries the retryable ones (max 3 attempts).
 *
 * With the WhatsApp env vars absent it answers `{ skipped: "not_configured" }`
 * straight away — still a success, so the heartbeat stays green while the
 * channel is simply off.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return runCronJob(request, "whatsapp-dispatch", async () => {
    const summary = await dispatchDueWhatsApp();
    if (summary.checked) logger.info("whatsapp-dispatch run", { ...summary });
    // Fix 13: an order confirmation whose send failed goes again (three attempts in all).
    const confirmations = await retryOrderPlacedNotifications();
    if (confirmations.retried) logger.info("order confirmations retried", confirmations);
    return { ...summary, order_confirmations_retried: confirmations.retried };
  });
}
