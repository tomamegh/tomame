/**
 * Where a person lands once they have signed in.
 *
 * ONE RULE, THREE CALLERS. Password login, Google/OAuth callback and email
 * confirmation each used to hardcode `/app`, so an administrator signing in was
 * dropped into the customer storefront and had to know to type `/admin` to get
 * to their own tools. Kelvin's instruction: an admin should be **met with the
 * admin view**, and choose to switch out to the customer view — not the other
 * way round.
 *
 * Pure and dependency free, like `canAccessAdmin` beside it, so it can be unit
 * tested and so the OAuth callback (a route handler) and the login form (a
 * client component) can share exactly one spelling of the rule.
 *
 * AN EXPLICIT `next` ALWAYS WINS, for both roles. It is the record of what the
 * person was actually trying to reach when they were interrupted: the proxy
 * writes `?next=` when it bounces someone off a gated route, and the quote flow
 * sends a signed-out visitor to sign in mid-checkout. Sending an admin to
 * `/admin` when they had just clicked "pay" on their own bag would lose the
 * thing they were doing, which is a worse failure than an extra click.
 */

export interface PostAuthDestinationInput {
  /** The `?next=` parameter, if there was one. Untrusted — validated here. */
  next?: string | null;
  /** Whether this person may reach `/admin` — decide it with `canAccessAdmin`. */
  isAdmin: boolean;
}

/** Where a customer goes with no other instruction. */
export const CUSTOMER_HOME = "/app";
/** Where an administrator goes with no other instruction. */
export const ADMIN_HOME = "/admin";

export function postAuthDestination({ next, isAdmin }: PostAuthDestinationInput): string {
  const explicit = safeInternalPath(next);
  if (explicit) return explicit;
  return isAdmin ? ADMIN_HOME : CUSTOMER_HOME;
}

/**
 * A `next` we are willing to send a freshly authenticated browser to.
 *
 * Same-origin paths only. `//evil.example` is the attack this refuses: the
 * browser reads a leading double slash as a protocol-relative URL, so a
 * redirect to it leaves the site entirely — and it leaves *immediately after a
 * successful sign-in*, which is exactly when someone is most likely to retype a
 * password into whatever appears. A backslash is rejected for the same reason,
 * because some browsers normalise `/\` to `//`.
 */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}
