import "server-only";

import { listAuditLogsSince, type AuditLogRow } from "@/db/queries/audit-logs";
import { findLatestNotificationFor } from "@/db/queries/notifications";
import { getOrderGroupById } from "@/db/queries/order-groups";
import { notifyCustomer } from "@/features/notifications/services/customer-notify.service";
import { orderRepricedTemplate } from "@/lib/email/templates/order-repriced";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { whatsappMessages } from "@/lib/whatsapp/templates";
import { getOrderById } from "./orders.service";

/**
 * Tell customers when a re-price (order-reprice.service.ts) moved the total of
 * their unpaid order or bag: email, WhatsApp when it is on, and the bell.
 *
 * ONCE IT SETTLES. An admin fixing five rates re-prices a bag five times in a
 * few minutes; the customer should hear once, with the final figure. A target
 * is told only after `QUIET_MINUTES` with no further re-price, and only when its
 * total differs from what they were last told: the last `order_repriced`
 * notice, or the checkout total before the first re-price. A change that was
 * undone says nothing.
 *
 * Run from the `reprice-unpaid-orders` cron, so a notice lands 10 to 25
 * minutes after the last edit.
 */

export const REPRICE_NOTICE_EVENT = "order_repriced";
/** How long a total must sit still before the customer is told. */
export const QUIET_MINUTES = 10;
/** How far back re-prices are read. Far longer than quiet + cron interval. */
const LOOKBACK_HOURS = 6;

interface Target {
  kind: "group" | "order";
  id: string;
  /** The total before the first re-price in the window. */
  firstFromGhs: number;
  lastRepricedAt: string;
}

export async function notifyRepricedTotals(now = new Date()): Promise<{ notified: number }> {
  const since = new Date(now.getTime() - LOOKBACK_HOURS * 3600_000).toISOString();
  const audits = await listAuditLogsSince(["order_repriced", "order_group_repriced"], since);
  const quietBefore = now.getTime() - QUIET_MINUTES * 60_000;

  let notified = 0;
  for (const target of collectTargets(audits)) {
    if (Date.parse(target.lastRepricedAt) > quietBefore) continue;
    if (await notifyTarget(target, now)) notified += 1;
  }
  return { notified };
}

/** One target per bag, or per order bought on its own; a bag's lines are told through the bag. */
function collectTargets(audits: readonly AuditLogRow[]): Target[] {
  const targets = new Map<string, Target>();
  for (const row of audits) {
    const meta = row.metadata ?? {};
    const isGroup = row.action === "order_group_repriced";
    if (!isGroup && meta.order_group_id) continue;
    const from = (meta.total_ghs as { from?: unknown } | undefined)?.from;
    const key = `${isGroup ? "group" : "order"}:${row.entity_id}`;
    const existing = targets.get(key);
    if (existing) existing.lastRepricedAt = row.created_at;
    else if (typeof from === "number") {
      targets.set(key, { kind: isGroup ? "group" : "order", id: row.entity_id, firstFromGhs: from, lastRepricedAt: row.created_at });
    }
  }
  return [...targets.values()];
}

async function notifyTarget(target: Target, now: Date): Promise<boolean> {
  const current = await currentTotal(target);
  if (!current) return false;

  const previous = await findLatestNotificationFor(current.userId, REPRICE_NOTICE_EVENT, "target_id", target.id);
  const toldGhs = typeof previous?.payload.to_ghs === "number" ? previous.payload.to_ghs : target.firstFromGhs;
  if (Math.abs(toldGhs - current.totalGhs) < 0.005) return false;

  const pesewas = Math.round(current.totalGhs * 100);
  await notifyCustomer({
    userId: current.userId,
    event: REPRICE_NOTICE_EVENT,
    payload: {
      target_id: target.id,
      ...(target.kind === "group" ? { order_group_id: target.id } : { order_id: target.id }),
      from_ghs: toldGhs,
      to_ghs: current.totalGhs,
      href: current.payPath,
    },
    template: orderRepricedTemplate({
      what: current.what,
      fromGhs: toldGhs,
      toGhs: current.totalGhs,
      payUrl: `${env.app.url}${current.payPath}`,
    }),
    now,
    whatsapp: {
      dedupeKey: `${REPRICE_NOTICE_EVENT}:${target.kind}:${target.id}:${pesewas}`,
      message: whatsappMessages.orderRepriced({
        what: current.what,
        fromGhs: toldGhs,
        toGhs: current.totalGhs,
        payPath: current.payPath,
      }),
    },
    source: "reprice-unpaid-orders",
  });
  return true;
}

/** The target's total now, while it is still waiting for payment; null once paid, cancelled or gone. */
async function currentTotal(target: Target): Promise<{ userId: string; totalGhs: number; what: string; payPath: string } | null> {
  if (target.kind === "group") {
    const group = await getOrderGroupById(target.id);
    if (!group || group.status !== "pending") return null;
    const items = Number(group.item_count);
    const bag = `bag of ${items} ${items === 1 ? "item" : "items"}`;
    return { userId: group.user_id, totalGhs: Number(group.total_ghs), what: `your ${bag}`, payPath: "/app/bag" };
  }
  const order = await getOrderById(createAdminClient(), target.id);
  if (!order || order.status !== "pending" || order.needs_review || order.admin_total_ghs != null) return null;
  return {
    userId: order.user_id,
    totalGhs: Number(order.pricing.total_ghs),
    what: order.product_name,
    payPath: `/app/orders/${order.id}`,
  };
}
