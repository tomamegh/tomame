import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logAuditEvent } from "@/features/audit/services/audit.service";
import { loadBoxConstants } from "@/features/bag/services/bag.service";
import { packLines } from "@/features/bag/services/box-packing";
import { orderGroupTotals } from "@/features/bag/services/group-totals";
import { priceExtractionWith, type PriceOverrides } from "@/features/extraction/quote.service";
import type { ExtractionResult } from "@/features/extraction/types";
import { findActivePayment } from "@/features/payments/services/payments.service";
import { loadPricingCalculator } from "@/features/pricing/services/pricing.service";
import { extractionUnderLock } from "@/features/quotes/services/quote-lock.service";
import { getOrderGroupById, updateOrderGroupTotals } from "@/db/queries/order-groups";
import { listOrdersByGroup, listUnpaidCalculatedOrders, updateUnpaidOrderPricing } from "@/db/queries/orders";
import { getQuoteLockById } from "@/db/queries/quote-locks";
import type { FxOverride, PricingBreakdown, PricingCalculator } from "@/lib/pricing";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Order } from "../types";

/**
 * Re-price checked-out, unpaid orders after an admin pricing change.
 *
 * WHY. A quote, a bag line and order intake all price from the live pricing
 * tables, but an order's total is struck once at checkout (`orders.pricing`,
 * the group's `total_pesewas`) and Paystack charges that column. An admin who
 * fixes a freight rate used to leave every unpaid order on the old figure
 * until it was paid or expired at 48 h.
 *
 * WHAT MOVES. Only the admin's knobs: freight, handling, tax and fee
 * percentages, fixed-freight rates, the consolidation saving. Each order is
 * re-priced from its own extraction snapshot at the FX and item price it was
 * placed at, so an exchange-rate move or a re-scraped listing never shifts an
 * order here. A re-price whose item or store-shipping USD would not reproduce
 * is skipped rather than guessed at.
 *
 * WHAT IS LEFT ALONE. Paid orders, orders waiting for review or carrying an
 * admin-set price, and any order or bag with a Paystack transaction open
 * (pending or successful): the customer may be paying the old amount right
 * now. The cron picks those up once that transaction fails or is abandoned.
 *
 * Idempotent: with no admin change, every order prices to its stored total and
 * nothing is written.
 */

export interface RepriceSummary {
  scanned: number;
  ordersRepriced: number;
  groupsRepriced: number;
  skippedPaymentOpen: number;
  skippedNotReproducible: number;
  skippedUnpriced: number;
}

export interface RepriceContext {
  actorId: string | null;
  /** What prompted the run, for the audit row ("pricing_group_updated", "cron"). */
  reason: string;
}

type Outcome = { kind: "same" } | { kind: "changed"; pricing: PricingBreakdown } | { kind: "drift" } | { kind: "unpriced" };

const r2 = (n: number) => Math.round(n * 100) / 100;
const sameMoney = (a: number | undefined, b: number | undefined) => Math.abs((a ?? 0) - (b ?? 0)) < 0.005;

export async function repriceUnpaidOrders(ctx: RepriceContext): Promise<RepriceSummary> {
  const admin = createAdminClient();
  const summary: RepriceSummary = { scanned: 0, ordersRepriced: 0, groupsRepriced: 0, skippedPaymentOpen: 0, skippedNotReproducible: 0, skippedUnpriced: 0 };

  const unpaid = await listUnpaidCalculatedOrders(admin);
  if (unpaid.length === 0) return summary;

  const calculator = await loadPricingCalculator();
  if (calculator.missingConstants.length > 0) {
    // A half-configured table set would price every order as needs_review.
    logger.warn("order re-price skipped: pricing constants incomplete", { missing: calculator.missingConstants });
    return summary;
  }

  const groupIds = new Set<string>();
  const singles: Order[] = [];
  for (const order of unpaid) {
    if (order.order_group_id) groupIds.add(order.order_group_id);
    else singles.push(order);
  }

  for (const order of singles) {
    summary.scanned += 1;
    if (await findActivePayment(admin, { orderId: order.id })) {
      summary.skippedPaymentOpen += 1;
      continue;
    }
    const outcome = await repriceOrder(calculator, order);
    tally(summary, outcome);
    if (outcome.kind !== "changed") continue;
    // Checked again just before the write: a checkout opened while this order
    // was being priced must be charged what it was shown.
    if (await findActivePayment(admin, { orderId: order.id })) {
      summary.skippedPaymentOpen += 1;
      continue;
    }
    if (await updateUnpaidOrderPricing(admin, order.id, outcome.pricing)) {
      summary.ordersRepriced += 1;
      await auditOrder(order, outcome.pricing, ctx);
    }
  }

  for (const groupId of groupIds) {
    await repriceGroup(admin, calculator, groupId, ctx, summary);
  }

  if (summary.ordersRepriced > 0 || summary.skippedNotReproducible > 0) {
    logger.info("unpaid orders re-priced", { ...summary, reason: ctx.reason });
  }
  return summary;
}

async function repriceGroup(
  admin: SupabaseClient,
  calculator: PricingCalculator,
  groupId: string,
  ctx: RepriceContext,
  summary: RepriceSummary,
): Promise<void> {
  const group = await getOrderGroupById(groupId);
  if (!group || group.status !== "pending") return;
  const orders = await listOrdersByGroup(admin, groupId);
  summary.scanned += orders.length;

  // A line an admin priced by hand, or one still under review, is not the
  // calculator's to move, and the group total is one figure: leave the bag.
  if (orders.some((o) => o.status !== "pending" || o.needs_review || o.admin_total_ghs != null)) return;
  if (await findActivePayment(admin, { groupId })) {
    summary.skippedPaymentOpen += orders.length;
    return;
  }

  const outcomes = await Promise.all(orders.map((o) => repriceOrder(calculator, o)));
  outcomes.forEach((o) => tally(summary, o));
  // All or nothing: a group struck from a mix of old and new lines would be neither.
  if (outcomes.some((o) => o.kind === "drift" || o.kind === "unpriced")) return;

  const repriced = orders.map((o, i) => {
    const outcome = outcomes[i]!;
    return outcome.kind === "changed" ? { ...o, pricing: outcome.pricing } : o;
  });
  const saving = consolidationSavingGhs(repriced, await loadBoxConstants());
  const patch = orderGroupTotals(repriced, saving, group.delivery_fee_ghs);
  const linesChanged = outcomes.some((o) => o.kind === "changed");
  if (!linesChanged && sameMoney(patch.total_ghs, group.total_ghs)) return;
  // Again just before the writes, as for a single order. A line write that
  // misses (paid or cancelled meanwhile) stops here; the next pass re-strikes
  // the group from whatever its lines then say.
  if (await findActivePayment(admin, { groupId })) {
    summary.skippedPaymentOpen += orders.length;
    return;
  }

  for (let i = 0; i < orders.length; i++) {
    const outcome = outcomes[i]!;
    if (outcome.kind !== "changed") continue;
    if (!(await updateUnpaidOrderPricing(admin, orders[i]!.id, outcome.pricing))) return;
    summary.ordersRepriced += 1;
    await auditOrder(orders[i]!, outcome.pricing, ctx);
  }
  if (!(await updateOrderGroupTotals(groupId, patch))) return;
  summary.groupsRepriced += 1;
  await logAuditEvent({
    actorId: ctx.actorId,
    actorRole: ctx.actorId ? "admin" : "system",
    action: "order_group_repriced",
    entityType: "order_group",
    entityId: groupId,
    metadata: {
      reason: ctx.reason,
      total_ghs: { from: group.total_ghs, to: patch.total_ghs },
      consolidation_saving_ghs: { from: group.consolidation_saving_ghs, to: patch.consolidation_saving_ghs },
    },
  });
}

/**
 * One order, re-priced the way order intake priced it: the stored snapshot,
 * the customer's chosen shipping service, a gap-filled or buyer-sourced price
 * kept as the USD figure, a lock's store-shipping rule, and the FX the order
 * was struck at.
 */
export async function repriceOrder(calculator: PricingCalculator, order: Order): Promise<Outcome> {
  const old = order.pricing;
  const snapshot = order.extraction_metadata;
  if (!snapshot?.product || !old || old.pricing_method === "needs_review" || !(old.total_ghs > 0)) return { kind: "unpriced" };

  const lock = old.rate_lock_id
    ? await getQuoteLockById(old.rate_lock_id).catch((error: unknown) => {
        // Without the lock the FX is read off the breakdown; the reproduce check below still guards it.
        logger.warn("order re-price: rate lock read failed", { orderId: order.id, error: error instanceof Error ? error.message : String(error) });
        return null;
      })
    : null;
  const base: ExtractionResult = { ...snapshot, country: order.origin_country };

  const listed = snapshot.product.price;
  const listedCurrency = (snapshot.product.currency ?? "USD").toUpperCase();
  const priceIsListing = listed != null && sameMoney(listed, old.item_price) && listedCurrency === old.item_currency.toUpperCase();
  const overrides: PriceOverrides = {
    ...(priceIsListing ? {} : { itemPriceUsd: old.item_price_usd }),
    ...(old.store_shipping_option?.code ? { storeShippingCode: old.store_shipping_option.code } : {}),
  };
  const extraction = lock ? extractionUnderLock(base, lock, overrides) : base;

  const { pricing } = await priceExtractionWith(calculator, extraction, order.quantity, overrides, orderFx(old, lock?.fx_rates ?? null));
  if (!pricing || pricing.pricing_method === "needs_review") return { kind: "unpriced" };
  // The customer's money must reproduce exactly; only the admin's knobs may move.
  if (!sameMoney(pricing.subtotal_usd, old.subtotal_usd) || !sameMoney(pricing.store_shipping_usd, old.store_shipping_usd)) {
    logger.info("order re-price: snapshot does not reproduce the order, left as is", {
      orderId: order.id,
      subtotal_usd: { stored: old.subtotal_usd, repriced: pricing.subtotal_usd },
      store_shipping_usd: { stored: old.store_shipping_usd ?? 0, repriced: pricing.store_shipping_usd ?? 0 },
    });
    return { kind: "drift" };
  }
  if (sameMoney(pricing.total_ghs, old.total_ghs)) return { kind: "same" };

  return {
    kind: "changed",
    pricing: {
      ...pricing,
      // The order keeps its lock and the delivery window it was quoted.
      ...(old.rate_lock_id ? { rate_lock_id: old.rate_lock_id, rate_locked_until: old.rate_locked_until } : {}),
      ...(old.delivery_eta_from ? { delivery_eta_from: old.delivery_eta_from, delivery_eta_to: old.delivery_eta_to } : {}),
    },
  };
}

/**
 * The FX the order was struck at. Cross rates come from its lock when it had
 * one; otherwise they are read back off the breakdown (listed price against its
 * USD figure), which is the rate intake converted with.
 */
function orderFx(old: PricingBreakdown, lockRates: Record<string, number> | null): FxOverride {
  const cross: Record<string, number> = { ...(lockRates ?? {}), USD: old.mid_market_rate };
  const add = (currency: string | undefined, listed: number | undefined, usd: number | undefined) => {
    const cur = currency?.toUpperCase();
    if (!cur || cur === "USD" || cross[cur] || !listed || !usd) return;
    cross[cur] = (usd * old.mid_market_rate) / listed;
  };
  add(old.item_currency, old.item_price, old.item_price_usd);
  add(old.store_shipping_currency, old.store_shipping, old.store_shipping_usd != null ? old.store_shipping_usd / old.quantity : undefined);
  return { exchange_rate: old.exchange_rate, mid_market_rate: old.mid_market_rate, cross_rates: cross };
}

/** The saving the bag's boxes earn on these lines, packed as checkout packed them (line order). */
function consolidationSavingGhs(orders: Order[], constants: Awaited<ReturnType<typeof loadBoxConstants>>): number {
  const plan = packLines(
    orders.map((o) => ({
      id: o.id,
      quantity: o.quantity,
      region_code: o.extraction_metadata?.country ?? o.origin_country,
      weight_lbs: o.extraction_metadata?.product?.weight_lbs ?? null,
      pricing: o.pricing,
    })),
    constants,
  );
  return r2(plan.consolidation_saving_ghs);
}

function tally(summary: RepriceSummary, outcome: Outcome): void {
  if (outcome.kind === "drift") summary.skippedNotReproducible += 1;
  if (outcome.kind === "unpriced") summary.skippedUnpriced += 1;
}

async function auditOrder(order: Order, pricing: PricingBreakdown, ctx: RepriceContext): Promise<void> {
  await logAuditEvent({
    actorId: ctx.actorId,
    actorRole: ctx.actorId ? "admin" : "system",
    action: "order_repriced",
    entityType: "order",
    entityId: order.id,
    metadata: {
      reason: ctx.reason,
      order_group_id: order.order_group_id ?? null,
      total_ghs: { from: order.pricing.total_ghs, to: pricing.total_ghs },
      freight_ghs: { from: order.pricing.flat_rate_ghs, to: pricing.flat_rate_ghs },
      value_fee_usd: { from: order.pricing.value_fee_usd, to: pricing.value_fee_usd },
      tax_usd: { from: order.pricing.tax_usd, to: pricing.tax_usd },
    },
  });
}
