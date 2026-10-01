import "server-only";

import { RATE_LIMIT } from "@/config/security";
import {
  getOrderOwnerEmail,
  getOrderPhones,
  getTrackingOrderByNo,
  listTrackingEvents,
} from "@/db/queries/public-tracking";
import { orderEta, storeNameFor } from "@/features/journeys/order-facts";
import type { OrderPricingBreakdown } from "@/features/orders/types";
import { checkRateLimit } from "@/lib/rate-limit";

import {
  TRACKING_NOT_FOUND,
  classifyTrackingQuery,
  parseVerifier,
  shapePublicTracking,
  verifierMatches,
  type PublicTrackingResult,
} from "../public-tracking";

/**
 * `/track` (086): find a shipment by its Tomame number (`TM-00042`), with no
 * login. Carrier numbers are internal and are never looked up here. The rules — what a reference alone shows, what needs a second
 * factor, and why — live in `../public-tracking.ts`.
 *
 * The per-IP limit is the route's. This service adds the per-REFERENCE limit on
 * second-factor attempts, which is the one that matters: it holds however many
 * addresses the guesses come from.
 */
export async function lookupPublicTracking(input: {
  query: string;
  verifier?: string | null;
  viewerId: string | null;
  ip?: string;
}): Promise<PublicTrackingResult> {
  const query = classifyTrackingQuery(input.query);
  if (query.kind === "invalid") return TRACKING_NOT_FOUND;

  const order = await getTrackingOrderByNo(query.orderNo);
  if (!order) return TRACKING_NOT_FOUND;

  const isOwner = !!input.viewerId && input.viewerId === order.user_id;
  let level: "coarse" | "full" = isOwner ? "full" : "coarse";
  let verifyFailed = false;

  const verifier = parseVerifier(input.verifier);
  if (level === "coarse" && input.verifier?.trim()) {
    // Per reference + address, so a stranger guessing cannot lock the customer
    // out; plus a looser per-reference ceiling against guesses from many addresses.
    const [mine, all] = await Promise.all([
      checkRateLimit(`track-verify:${order.order_no}:${input.ip ?? "unknown"}`, RATE_LIMIT.trackVerify),
      checkRateLimit(`track-verify:${order.order_no}`, RATE_LIMIT.trackVerifyReference),
    ]);
    if (!mine.allowed || !all.allowed || !verifier) {
      verifyFailed = true;
    } else {
      const [phones, email] = await Promise.all([
        verifier.kind === "phone_last4" ? getOrderPhones(order) : Promise.resolve([]),
        verifier.kind === "email" ? getOrderOwnerEmail(order.user_id) : Promise.resolve(null),
      ]);
      if (verifierMatches(verifier, { phones, email })) level = "full";
      else verifyFailed = true;
    }
  }

  const events = await listTrackingEvents(order.id);

  return shapePublicTracking(
    {
      order,
      eta: orderEta({
        eta_from: order.eta_from,
        eta_to: order.eta_to,
        estimated_delivery_date: order.estimated_delivery_date,
        // Only the two forecast dates were selected; nothing else of `pricing` is read.
        pricing: { delivery_eta_from: order.est_from, delivery_eta_to: order.est_to } as unknown as OrderPricingBreakdown,
      }),
      store: order.product_url ? storeNameFor(order.product_url, order.platform) : null,
      events,
    },
    level,
    { ownerHref: isOwner ? `/app/orders/${order.id}` : null, verifyFailed },
  );
}
