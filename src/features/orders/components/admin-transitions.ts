import type { AdminTone } from "@/components/layout/admin/admin-page";
import { journeyStageFor, type JourneyTone } from "../services/journey-stage";
import { allowedTransitionsFrom } from "../services/order-transitions";
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
 * gets the service's refusal — which is correct: this module decides what to
 * OFFER, never what is permitted.
 *
 * THE EDGES ARE NOT DEFINED HERE. They come from `ALLOWED_TRANSITIONS` in
 * `services/order-transitions.ts`, the same table `updateOrderStatusAdmin`
 * validates against. This module supplies only the WORDS for each destination.
 * That table used to be module-private inside `orders.service.ts` and was
 * duplicated here by hand, kept in step by a comment; a new edge added to the
 * service and forgotten here showed up as a control an admin could not find.
 * Now an edge cannot exist on one side only, and a destination with no copy is
 * a compile error rather than a blank button.
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

/**
 * What to call each destination, and what it does to the customer.
 *
 * Keyed by the status being moved TO, because that is what the words describe.
 * Every destination `ALLOWED_TRANSITIONS` can reach needs an entry; the
 * `Record<OrderStatus, …>` makes a missing one a type error.
 */
const TRANSITION_COPY: Record<OrderStatus, Omit<AdminTransition, "to">> = {
  pending: {
    label: "Reopen for payment",
    blurb: "Returns the order to awaiting payment.",
    tone: "muted",
    carriesTracking: false,
    destructive: false,
  },
  paid: {
    label: "Mark as paid",
    blurb: "Records that the money has landed.",
    tone: "green",
    carriesTracking: false,
    destructive: false,
  },
  cancelled: {
    label: "Cancel order",
    blurb: "Only for an order whose payment failed. The customer is emailed and the order stops here.",
    tone: "coral",
    carriesTracking: false,
    destructive: true,
  },
  processing: {
    label: "Mark as purchasing",
    blurb: "Tells the customer a buyer is placing their order with the store.",
    tone: "coral",
    carriesTracking: false,
    destructive: false,
  },
  in_transit: {
    label: "Mark as shipped",
    blurb: "Carries the carrier, the tracking number and the delivery window to the customer.",
    tone: "coral",
    carriesTracking: true,
    destructive: false,
  },
  delivered: {
    label: "Mark as delivered",
    blurb: "Stamps the delivery time and closes the journey on the customer's screen.",
    tone: "green",
    carriesTracking: false,
    destructive: false,
  },
  completed: {
    label: "Mark as complete",
    blurb: "Files the order away. Nothing further is expected of anyone.",
    tone: "green",
    carriesTracking: false,
    destructive: false,
  },
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
  const available: AdminTransition[] = allowedTransitionsFrom(status).map((to) => ({
    to,
    ...TRANSITION_COPY[to],
  }));

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
