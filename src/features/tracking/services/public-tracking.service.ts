import "server-only";

import { RATE_LIMIT } from "@/config/security";
import {
  getOrderOwnerEmail,
  getOrderPhones,
  getTrackingOrderByNo,
  listTrackingEvents,
  peekRateLimitCount,
} from "@/db/queries/public-tracking";
import { orderEta, storeNameFor } from "@/features/journeys/order-facts";
import type { OrderPricingBreakdown } from "@/features/orders/types";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

import {
  TRACKING_NOT_FOUND,
  classifyTrackingQuery,
  parseVerifier,
  shapePublicTracking,
  verifierMatches,
  type PublicTrackingResult,
  type Verifier,
  type VerifyOutcome,
} from "../public-tracking";

/**
 * `/track` (086): find a shipment by its Tomame number (`TM-00042`), with no
 * login. Carrier numbers are internal and are never looked up here. The rules — what a reference alone shows, what needs a second
 * factor, and why — live in `../public-tracking.ts`.
 *
 * The route limits lookups per caller. This service limits second-factor
 * attempts, in this order:
 *  1. input that is neither an email nor four-plus digits is answered
 *     `invalid` and counts against nothing;
 *  2. per reference + address (`trackVerify`), every attempt. When it denies,
 *     nothing else is touched;
 *  3. per reference from every address (`trackVerifyReference`), WRONG answers
 *     only: peeked before checking, hit only after a miss, so the owner
 *     verifying does not spend it. Two misses racing past the peek can each
 *     land; step 2 bounds how many one address can race.
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
  let verify: VerifyOutcome | null = null;

  if (level === "coarse" && input.verifier?.trim()) {
    const verifier = parseVerifier(input.verifier);
    verify = verifier ? await checkSecondFactor(order, verifier, input.ip ?? "unknown") : { kind: "invalid" };
    if (!verify) level = "full";
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
    { ownerHref: isOwner ? `/app/orders/${order.id}` : null, verify },
  );
}

type VerifyOrder = Parameters<typeof getOrderPhones>[0] & { id: string; order_no: string };

/** Null when the second factor matches; otherwise why it did not unlock. */
async function checkSecondFactor(order: VerifyOrder, verifier: Verifier, ip: string): Promise<VerifyOutcome | null> {
  const mine = await checkRateLimit(`track-verify:${order.order_no}:${ip}`, RATE_LIMIT.trackVerify);
  if (!mine.allowed) return limited(mine.resetAt);

  const referenceKey = `track-verify:${order.order_no}`;
  const ceiling = RATE_LIMIT.trackVerifyReference;
  const windowSeconds = Math.round(ceiling.windowMs / 1000);
  try {
    const misses = await peekRateLimitCount(referenceKey, windowSeconds);
    if (misses.count >= ceiling.maxRequests) return limited(misses.resetAt);
  } catch (error: unknown) {
    // Fails open, like `checkRateLimit`: the per-address limit above still holds.
    logger.warn("Tracking verify ceiling read failed; allowing the attempt", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let phones: string[] = [];
  let email: string | null = null;
  try {
    if (verifier.kind === "phone_last4") phones = await getOrderPhones(order);
    else email = await getOrderOwnerEmail(order.user_id);
  } catch (error: unknown) {
    logger.error("Tracking verify could not read what is on file", {
      source: "api:track",
      orderId: order.id,
      verifier: verifier.kind,
      error: error instanceof Error ? error.message : String(error),
    });
    return { kind: "error" };
  }

  // Nothing to compare with is not a wrong answer, and does not count as one.
  if (verifier.kind === "phone_last4" && phones.length === 0) return { kind: "no_phone_on_file" };
  if (verifierMatches(verifier, { phones, email })) return null;

  // A miss: now, and only now, spend the reference's shared allowance.
  await checkRateLimit(referenceKey, ceiling);
  return { kind: "mismatch" };
}

function limited(resetAt: number | undefined): VerifyOutcome {
  const ms = typeof resetAt === "number" && Number.isFinite(resetAt) ? resetAt - Date.now() : NaN;
  return { kind: "limited", retryInMinutes: Number.isFinite(ms) ? Math.max(1, Math.ceil(ms / 60_000)) : null };
}
