import type { AdminTone } from "@/components/layout/admin";
import type { PolicyRow } from "./types";

/**
 * Display and health helpers for the policies admin.
 *
 * The publish flag on a policy is not a cosmetic draft/live toggle. Five policy
 * slugs are hard-linked from surfaces a customer is already standing on — the
 * marketing footer links all five, the bag's summary card links
 * `/policies#payment` under the Pay button, and the account payment panel links
 * the same anchor. `/policies` renders only published rows, so an unpublished
 * or missing policy behind one of those links is a live link to nothing: the
 * customer clicks "Payment policy" seconds before paying and lands on a page
 * that does not contain it.
 *
 * That is the one thing this screen has to make impossible to miss, so the
 * check lives here as a pure function with a test rather than as a colour
 * chosen in JSX.
 *
 * Pure — no clock, no fetch. British English, as the rest of the product.
 */

/**
 * The slugs the storefront links to by anchor.
 *
 * Kept in sync with `src/components/layout/marketing/links.ts` (whose own test
 * pins the same five hrefs), `bag-summary-card.tsx` and
 * `account-payment-panel.tsx`. Adding a sixth link on the storefront without
 * adding it here only costs this screen a warning it could have given.
 */
export const LINKED_POLICY_SLUGS = [
  "privacy",
  "terms",
  "shipping",
  "returns",
  "payment",
] as const;

export type LinkedPolicySlug = (typeof LINKED_POLICY_SLUGS)[number];

/** The order the admin list shows policies in: linked ones first, then the rest. */
export function sortPoliciesForAdmin(policies: readonly PolicyRow[]): PolicyRow[] {
  const rank = (slug: string): number => {
    const index = LINKED_POLICY_SLUGS.indexOf(slug as LinkedPolicySlug);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...policies].sort(
    (a, b) => rank(a.slug) - rank(b.slug) || a.label.localeCompare(b.label),
  );
}

export type PolicyLinkState =
  /** Linked from the storefront and published — the link works. */
  | "live"
  /** Linked from the storefront but not published — the link goes nowhere. */
  | "broken_link"
  /** Published, but nothing links to it. Reachable only by scrolling /policies. */
  | "published_unlinked"
  /** Neither linked nor published. A draft, and harmless. */
  | "draft";

export function policyLinkState(policy: Pick<PolicyRow, "slug" | "is_published">): PolicyLinkState {
  const linked = (LINKED_POLICY_SLUGS as readonly string[]).includes(policy.slug);
  if (linked) return policy.is_published ? "live" : "broken_link";
  return policy.is_published ? "published_unlinked" : "draft";
}

/**
 * The chip wording and tone for each state.
 *
 * `broken_link` is coral, not amber: amber in this product means "a person
 * still owes somebody an action", and a dead link under the Pay button is not
 * a queue item — it is already wrong, on the live site, for every customer.
 */
export function policyLinkBadge(state: PolicyLinkState): { label: string; tone: AdminTone } {
  switch (state) {
    case "live":
      return { label: "Live", tone: "green" };
    case "broken_link":
      return { label: "Linked but unpublished", tone: "coral" };
    case "published_unlinked":
      return { label: "Published", tone: "neutral" };
    case "draft":
      return { label: "Draft", tone: "muted" };
  }
}

/**
 * The storefront anchors that currently lead nowhere: a linked slug that has no
 * row at all, or has one that is not published.
 *
 * Returned in `LINKED_POLICY_SLUGS` order so the warning reads the same way
 * every time rather than following whatever order the query happened to return.
 */
export function brokenPolicyLinks(
  policies: readonly Pick<PolicyRow, "slug" | "is_published">[],
): { slug: LinkedPolicySlug; reason: "missing" | "unpublished" }[] {
  const bySlug = new Map(policies.map((policy) => [policy.slug, policy]));
  const broken: { slug: LinkedPolicySlug; reason: "missing" | "unpublished" }[] = [];

  for (const slug of LINKED_POLICY_SLUGS) {
    const policy = bySlug.get(slug);
    if (!policy) broken.push({ slug, reason: "missing" });
    else if (!policy.is_published) broken.push({ slug, reason: "unpublished" });
  }
  return broken;
}

/**
 * How much text a policy actually has, as a word count.
 *
 * `content` is HTML from the rich-text editor, so tags are stripped before
 * counting — otherwise an empty `<p></p>` reads as two words and a policy that
 * has never been written looks finished.
 */
export function policyWordCount(content: string): number {
  const text = content
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  if (text.length === 0) return 0;
  return text.split(/\s+/).length;
}
