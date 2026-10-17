import type { Order } from "@/features/orders/types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A group's money columns rolled up from its orders: the sum of the lines,
 * less the consolidation saving, plus the delivery fee. Checkout and the
 * unpaid-order re-price (order-reprice.service.ts) both strike totals here.
 */
export function orderGroupTotals(orders: Order[], consolidationSavingGhs: number, deliveryFeeGhs: number) {
  const sumOf = (pick: (o: Order) => number | undefined) => r2(orders.reduce((acc, o) => acc + (pick(o) ?? 0), 0));
  const total_ghs = r2(sumOf((o) => o.pricing.total_ghs) - consolidationSavingGhs + deliveryFeeGhs);
  return {
    subtotal_usd: sumOf((o) => o.pricing.subtotal_usd),
    tax_usd: sumOf((o) => o.pricing.tax_usd),
    fee_usd: sumOf((o) => o.pricing.value_fee_usd),
    store_shipping_usd: sumOf((o) => o.pricing.store_shipping_usd),
    freight_ghs: sumOf((o) => o.pricing.flat_rate_ghs),
    consolidation_saving_ghs: consolidationSavingGhs,
    total_ghs,
    total_pesewas: Math.round(total_ghs * 100),
  };
}
