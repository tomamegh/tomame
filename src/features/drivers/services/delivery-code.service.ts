import "server-only";

import { findOpenCustomerCode, listDeliveryRows, setDeliveryCode } from "@/db/queries/driver-deliveries";
import { listWarehouseOrders } from "@/db/queries/warehouse";
import { logger } from "@/lib/logger";

import { generateDeliveryCode } from "../delivery-code";

/**
 * Give each order a delivery code once it is close enough to need one (102):
 * at our Accra warehouse, out for delivery, or ready for pickup. A customer with
 * several parcels on the way gets ONE code for all of them, so a driver at their
 * door asks once.
 *
 * NEVER THROWS: it runs after a move that has already happened. An order left
 * without a code is caught again the next time the customer opens it.
 */
export async function ensureDeliveryCodes(orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return;
  try {
    const [rows, orders] = await Promise.all([
      listDeliveryRows(orderIds),
      listWarehouseOrders({ ids: orderIds, limit: orderIds.length }),
    ]);
    const hasCode = new Set(rows.filter((r) => r.delivery_code).map((r) => r.order_id));
    const byCustomer = new Map<string, string>();
    const at = new Date().toISOString();
    for (const order of orders) {
      if (hasCode.has(order.id) || order.status !== "in_transit") continue;
      let code = byCustomer.get(order.user_id) ?? (await findOpenCustomerCode(order.user_id));
      if (!code) code = generateDeliveryCode();
      byCustomer.set(order.user_id, code);
      await setDeliveryCode(order.id, order.user_id, code, at);
    }
  } catch (error) {
    logger.warn("delivery codes not issued", {
      orderIds,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
