import type { OrderStatus } from "../types";

/**
 * The order state machine's edges — the ONE table.
 *
 * Pure and framework-free on the same contract as `journey-stage.ts`: no
 * `server-only`, no Supabase, no React. That purity is what makes this module
 * possible at all. The table used to live module-private inside
 * `orders.service.ts` and was mirrored by hand in
 * `components/admin-transitions.ts`, because the service imports
 * `lib/supabase/admin.ts` and CLAUDE.md forbids that reaching client code. So
 * the edges were written twice and kept in step by a comment.
 *
 * Now the service validates against this table and the admin console draws its
 * buttons from it, and neither can drift from the other.
 *
 * CLAUDE.md's state machine is the authority for what belongs here:
 *
 * ```
 * pending_payment → paid → processing → in_transit → delivered
 * pending_payment → cancelled (only if payment fails)
 * ```
 *
 * (`pending` is this codebase's spelling of `pending_payment`, and `completed`
 * is the filed-away terminal the admin console adds after delivery.)
 *
 * `completed` and `cancelled` are absent by design: they are ends of the line,
 * and a status with no entry here offers nothing.
 */
export const ALLOWED_TRANSITIONS: Record<string, OrderStatus[]> = {
  pending: ["cancelled"],
  paid: ["processing"],
  processing: ["in_transit"],
  in_transit: ["delivered"],
  delivered: ["completed"],
};

/**
 * The statuses reachable from `status`, or an empty list for a terminal or
 * unrecognised one.
 *
 * `Object.hasOwn` rather than `?? []` is load-bearing: a plain object literal
 * inherits from `Object.prototype`, so `ALLOWED_TRANSITIONS["toString"]` is a
 * FUNCTION, not `undefined`, and `?? []` hands it straight back. The admin
 * console's own table guarded against that; the service's did not, and merging
 * the two would have quietly spread the weaker version. A status arriving here
 * is a string from a database column or a URL, not a value this module chose.
 */
export function allowedTransitionsFrom(status: string): OrderStatus[] {
  return Object.hasOwn(ALLOWED_TRANSITIONS, status) ? ALLOWED_TRANSITIONS[status]! : [];
}
