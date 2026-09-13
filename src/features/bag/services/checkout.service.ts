import "server-only";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { createOrder } from "@/features/orders/services/orders.service";
import { getDeliveryAddressById } from "@/db/queries/delivery-addresses";
import { listOrdersByGroup } from "@/db/queries/orders";
import { setCartStatus } from "@/db/queries/carts";
import {
  findLatestPendingGroupForUser,
  insertOrderGroup,
  updateOrderGroupStatus,
  updateOrderGroupTotals,
  type OrderGroupRow,
} from "@/db/queries/order-groups";
import type { Order } from "@/features/orders/types";
import type { PlatformUser } from "@/features/users/types";
import type { Viewer } from "@/features/quotes/types";
import type { CheckoutInput } from "../schema";
import type { BagLine, BagView, CheckoutResult } from "../types";
import { getBag, resolveCart, setBagDelivery } from "./bag.service";

/**
 * Checkout: the bag becomes an order group — N one-product orders created
 * together, one delivery, one delivery fee, one Paystack total.
 *
 * Money rule: nothing here is read from the request. The bag is priced once
 * below — every line re-priced (lower of locked and live), boxes re-packed —
 * and the group's columns are those roll-ups plus the zone's fee;
 * `total_pesewas` is what the
 * payment will ask Paystack for. `createOrder` prices each line again through
 * order-intake and consumes its lock; if that second read landed lower (a rate
 * ratchet between reads), the group is corrected from the orders — the
 * customer never pays more than the sum of their orders.
 *
 * Idempotency: the cart flips to `checked_out` at the end, so a repeated POST
 * finds no open lines and returns the customer's newest pending group instead
 * of creating a second one.
 */
export async function checkoutBag(user: PlatformUser, viewer: Viewer, input: CheckoutInput): Promise<CheckoutResult> {
  // `setBagDelivery` returns the bag it just re-priced (every line under the
  // rate lock, boxes re-packed and persisted). Keep it: a second `getBag` here
  // would redo that whole pass for one checkout. Only a body that named no
  // delivery has to read the bag itself.
  let delivered: BagView | null = null;
  if (input.delivery_address_id) delivered = await setBagDelivery(viewer, { delivery_address_id: input.delivery_address_id });
  else if (input.delivery_zone_id) delivered = await setBagDelivery(viewer, { delivery_zone_id: input.delivery_zone_id });

  const cart = await resolveCart(viewer);
  const bag = cart ? (delivered ?? (await getBag(viewer))) : null;
  if (!cart || !bag || bag.lines.length === 0) {
    const pending = await findLatestPendingGroupForUser(user.id);
    if (pending) return toCheckoutResult(pending, await listOrdersByGroup(createAdminClient(), pending.id));
    throw new APIError(400, "Your bag is empty");
  }
  if (!bag.delivery) throw new APIError(400, "Choose where to deliver first");
  if (bag.has_unpriced_lines) {
    throw new APIError(409, "One or more lines could not be priced. Remove them or paste the link again.");
  }

  const snapshot = await deliverySnapshot(bag);
  const group = await insertOrderGroup({
    user_id: user.id,
    delivery_address_id: bag.delivery.address_id,
    delivery_zone_id: bag.delivery.zone_id,
    delivery_address: snapshot,
    item_count: bag.item_count,
    subtotal_usd: bag.subtotal_usd,
    tax_usd: bag.tax_usd,
    fee_usd: bag.fee_usd,
    freight_ghs: bag.freight_ghs,
    consolidation_saving_ghs: bag.consolidation_saving_ghs,
    delivery_fee_ghs: bag.delivery_fee_ghs,
    total_ghs: bag.total_ghs,
    total_pesewas: Math.round(bag.total_ghs * 100),
    status: "pending",
  });

  const admin = createAdminClient();
  const orders: Order[] = [];
  try {
    for (const line of bag.lines) {
      const box = bag.boxes.find((b) => b.line_ids.includes(line.id)) ?? null;
      orders.push(
        await createOrder(admin, user, orderInputFor(line), viewer, {
          order_group_id: group.id,
          consolidation_box_id: box?.id ?? null,
          delivery_address_id: bag.delivery.address_id,
          suppress_placed_email: true,
        }),
      );
    }
  } catch (error) {
    // Some orders may exist under a group nobody can pay for; retire the group
    // so it is never charged, keep the cart open so the customer can retry.
    await updateOrderGroupStatus(group.id, "pending", "cancelled").catch(() => undefined);
    logger.error("checkout: creating the group's orders failed", {
      orderGroupId: group.id,
      created: orders.map((o) => o.id),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const settled = await reconcileTotals(group, bag, orders);

  if (!(await setCartStatus(cart.id, "open", "checked_out", { order_group_id: group.id }))) {
    logger.warn("checkout: cart was no longer open when flipping it", { cartId: cart.id, orderGroupId: group.id });
  }

  await logAuditEvent({
    actorId: user.id,
    actorRole: "user",
    action: "order_group_created",
    entityType: "order_group",
    entityId: group.id,
    metadata: {
      order_ids: orders.map((o) => o.id),
      total_ghs: settled.total_ghs,
      total_pesewas: settled.total_pesewas,
      delivery_fee_ghs: settled.delivery_fee_ghs,
      consolidation_saving_ghs: settled.consolidation_saving_ghs,
    },
  });

  return toCheckoutResult(settled, orders);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The bag line as the order-intake trust boundary expects it: identity, quantity, gap-fillers. */
function orderInputFor(line: BagLine): Parameters<typeof createOrder>[2] {
  const image = line.product.image && isHttpUrl(line.product.image) ? line.product.image : undefined;
  return {
    product_url: line.product.url,
    product_name: (line.product.title ?? "Product from link").slice(0, 500),
    ...(image && { product_image_url: image }),
    quantity: line.quantity,
    ...(line.special_instructions && { special_instructions: line.special_instructions }),
    extraction_cache_id: line.extraction_cache_id,
    ...(line.gap_price_usd != null && { estimated_price_usd: line.gap_price_usd }),
    ...(line.gap_origin_country && { origin_country: line.gap_origin_country }),
  };
}

function isHttpUrl(value: string): boolean {
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** What "Deliver to" said at checkout — frozen, so a later address-book edit cannot move it. */
async function deliverySnapshot(bag: BagView): Promise<Record<string, unknown>> {
  const delivery = bag.delivery!;
  if (delivery.kind === "pickup" || !delivery.address_id) {
    return { kind: "pickup", zone_id: delivery.zone_id, zone_name: delivery.zone_name, fee_ghs: delivery.fee_ghs };
  }
  const address = await getDeliveryAddressById(delivery.address_id);
  return { ...(address ?? { id: delivery.address_id, label: delivery.label }), kind: "door", zone_id: delivery.zone_id, zone_name: delivery.zone_name, fee_ghs: delivery.fee_ghs };
}

/**
 * The orders are the money of record. If their sum moved from what the bag
 * showed (a rate ratchet between the two reads), the group follows them;
 * saving and delivery are the group's own and stay.
 */
async function reconcileTotals(group: OrderGroupRow, bag: BagView, orders: Order[]): Promise<OrderGroupRow> {
  const sumOf = (pick: (o: Order) => number) => r2(orders.reduce((acc, o) => acc + (pick(o) ?? 0), 0));
  const gross = sumOf((o) => o.pricing.total_ghs);
  const bagGross = r2(bag.total_ghs - bag.delivery_fee_ghs + bag.consolidation_saving_ghs);
  if (Math.abs(gross - bagGross) <= 0.005) return group;

  const total_ghs = r2(gross - group.consolidation_saving_ghs + group.delivery_fee_ghs);
  const patch = {
    subtotal_usd: sumOf((o) => o.pricing.subtotal_usd),
    tax_usd: sumOf((o) => o.pricing.tax_usd),
    fee_usd: sumOf((o) => o.pricing.value_fee_usd),
    freight_ghs: sumOf((o) => o.pricing.flat_rate_ghs),
    total_ghs,
    total_pesewas: Math.round(total_ghs * 100),
  };
  logger.info("checkout: group total corrected from its orders", { orderGroupId: group.id, bagGross, ordersGross: gross, total_ghs });
  await updateOrderGroupTotals(group.id, patch);
  return { ...group, ...patch };
}

function toCheckoutResult(group: OrderGroupRow, orders: Order[]): CheckoutResult {
  return {
    order_group_id: group.id,
    order_ids: orders.map((o) => o.id),
    item_count: group.item_count,
    total_ghs: group.total_ghs,
    total_pesewas: group.total_pesewas,
    status: group.status,
  };
}
