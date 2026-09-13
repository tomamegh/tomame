import type { AdminTone } from "@/components/layout/admin/admin-page";
import { journeyStageFor, type JourneyTone } from "../services/journey-stage";
import type { OrderStatus } from "../types";

/**
 * What an admin may do to an order next, and what to call it.
 *
 * Pure and framework-free so the admin console can decide which buttons to draw
 * without a round trip, and so the rules are unit-tested without a database.
 *
 * **The server remains the authority.** `updateOrderStatusAdmin` validates every
 * transition against the order's CURRENT status and refuses an illegal one with
 * a 400; this module exists so an illegal transition is never OFFERED in the
 * first place. Two different admins on two laptops can still race, and the loser
 * gets the service's refusal — which is correct, and the reason this is a mirror
 * rather than a replacement.
 *
 * MIRROR OF `ALLOWED_TRANSITIONS` in `src/features/orders/services/orders.service.ts`.
 * That table is module-private, so the shape below is kept in step by the test
 * beside this file and by the comment you are reading. If the service's table
 * gains an edge, add it here too — a missing edge shows up as a control an admin
 * cannot find, which is a quiet failure.
 */

export interface AdminTransition {
  to: OrderStatus;
  /** The button's words, in the imperative: what the admin is about to do. */
  label: string;
  /** One line about what the CUSTOMER will see, because every one of these emails them. */
  blurb: string;
  tone: AdminTone;
  /**
   * The transition that carries the carrier, the tracking number and the ETA
   * window. Only `in_transit` does — `updateOrderStatusAdmin` writes those
   * columns on that transition and no other.
   */
  carriesTracking: boolean;
  /** A transition that cannot be walked back; the control asks first. */
  destructive: boolean;
}

const TRANSITIONS: Record<string, AdminTransition[]> = {
  pending: [
    {
      to: "cancelled",
      label: "Cancel order",
      blurb: "Only for an order whose payment failed. The customer is emailed and the order stops here.",
      tone: "coral",
      carriesTracking: false,
      destructive: true,
    },
  ],
  paid: [
    {
      to: "processing",
      label: "Mark as purchasing",
      blurb: "Tells the customer a buyer is placing their order with the store.",
      tone: "coral",
      carriesTracking: false,
      destructive: false,
    },
  ],
  processing: [
    {
      to: "in_transit",
      label: "Mark as shipped",
      blurb: "Carries the carrier, the tracking number and the delivery window to the customer.",
      tone: "coral",
      carriesTracking: true,
      destructive: false,
    },
  ],
  in_transit: [
    {
      to: "delivered",
      label: "Mark as delivered",
      blurb: "Stamps the delivery time and closes the journey on the customer's screen.",
      tone: "green",
      carriesTracking: false,
      destructive: false,
    },
  ],
  delivered: [
    {
      to: "completed",
      label: "Mark as complete",
      blurb: "Files the order away. Nothing further is expected of anyone.",
      tone: "green",
      carriesTracking: false,
      destructive: false,
    },
  ],
};

export interface TransitionContext {
  /**
   * Whether a SUCCESSFUL payment exists for this order.
   *
   * CLAUDE.md allows `pending → cancelled` "only if payment fails", so the
   * cancel control is withheld from an order that has been paid for. In practice
   * a successful payment has already flipped the order to `paid` — this is the
   * braces to that belt, and it is what stops an admin cancelling an order out
   * from under a payment that landed a second ago.
   */
  hasSuccessfulPayment: boolean;
  /**
   * An order still flagged `needs_review` has not been priced or approved, so it
   * must not be walked down the pipeline: the review decision comes first.
   */
  needsReview: boolean;
}

/**
 * The transitions to offer for an order, in the order they should be drawn.
 *
 * Returns an empty list for `completed`, `cancelled` and any status this module
 * does not recognise — all three are ends of the line, and offering a button
 * that the service will refuse is worse than offering none.
 */
export function transitionsFor(
  status: string,
  context: TransitionContext,
): AdminTransition[] {
  const available = Object.hasOwn(TRANSITIONS, status) ? TRANSITIONS[status]! : [];

  return available.filter((transition) => {
    if (transition.to === "cancelled" && context.hasSuccessfulPayment) return false;
    // A review decision is itself a transition of sorts — approving writes the
    // price the customer pays — and it has its own panel. Until it is made, the
    // pipeline controls stay out of the way.
    if (context.needsReview) return false;
    return true;
  });
}

/**
 * Whether the ETA window may be edited for an order in this status.
 *
 * Before payment there is nothing to promise, and after cancellation there is
 * nobody to promise it to. Everything between is fair game — including
 * `delivered`, because a window that was wrong should still be correctable in
 * the record an admin and a customer are both reading.
 */
export function mayEditEtaWindow(status: string): boolean {
  return status !== "pending" && status !== "cancelled";
}

/**
 * The admin kit's tone for an order status, taken from the journey vocabulary
 * rather than invented here — so a status is the same colour on the admin's
 * screen as it is on the customer's.
 *
 * `neutral` from the journey (cancelled, or a status the map has never seen)
 * becomes the kit's `muted`: neither is a position on the track, and muted is
 * how the admin draws "not live".
 */
export function adminStatusTone(status: string): AdminTone {
  const tone: JourneyTone = journeyStageFor(status).tone;
  switch (tone) {
    case "green":
      return "green";
    case "amber":
      return "amber";
    case "coral":
      return "coral";
    default:
      return "muted";
  }
}

/** The customer's own word for a status — "Being purchased", never "processing". */
export function adminStatusLabel(status: string): string {
  return journeyStageFor(status).label;
}
