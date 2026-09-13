import { describe, expect, it } from "vitest";

import {
  LINKED_POLICY_SLUGS,
  brokenPolicyLinks,
  policyLinkBadge,
  policyLinkState,
  policyWordCount,
  sortPoliciesForAdmin,
} from "../format";
import type { PolicyRow } from "../types";

function policy(overrides: Partial<PolicyRow> = {}): PolicyRow {
  return {
    id: "id",
    slug: "privacy",
    label: "Privacy",
    content: "",
    effective_date: null,
    last_updated: "2026-09-01T00:00:00Z",
    is_published: true,
    ...overrides,
  };
}

describe("policyLinkState", () => {
  it("calls a linked, published policy live", () => {
    expect(policyLinkState({ slug: "payment", is_published: true })).toBe("live");
  });

  it("calls a linked, unpublished policy a broken link", () => {
    // This is the case the screen exists to surface: the bag links
    // /policies#payment under the Pay button and the anchor renders nothing.
    expect(policyLinkState({ slug: "payment", is_published: false })).toBe("broken_link");
  });

  it("separates an unlinked published policy from a draft", () => {
    expect(policyLinkState({ slug: "cookies", is_published: true })).toBe("published_unlinked");
    expect(policyLinkState({ slug: "cookies", is_published: false })).toBe("draft");
  });
});

describe("policyLinkBadge", () => {
  it("spends coral only on the broken link", () => {
    // Amber means "a person still owes an action". A dead link on the live site
    // is not a queue item, so it must not borrow amber's meaning.
    expect(policyLinkBadge("broken_link").tone).toBe("coral");
    expect(policyLinkBadge("live").tone).toBe("green");
    expect(policyLinkBadge("draft").tone).toBe("muted");
  });
});

describe("brokenPolicyLinks", () => {
  it("reports a missing slug and an unpublished one differently", () => {
    const result = brokenPolicyLinks([
      policy({ slug: "privacy", is_published: true }),
      policy({ slug: "terms", is_published: true }),
      policy({ slug: "shipping", is_published: true }),
      policy({ slug: "returns", is_published: false }),
      // `payment` has no row at all.
    ]);

    expect(result).toEqual([
      { slug: "returns", reason: "unpublished" },
      { slug: "payment", reason: "missing" },
    ]);
  });

  it("is empty when every linked policy is published", () => {
    const all = LINKED_POLICY_SLUGS.map((slug) => policy({ slug, is_published: true }));
    expect(brokenPolicyLinks(all)).toEqual([]);
  });

  it("ignores policies nothing links to", () => {
    const all = [
      ...LINKED_POLICY_SLUGS.map((slug) => policy({ slug, is_published: true })),
      policy({ slug: "cookies", is_published: false }),
    ];
    expect(brokenPolicyLinks(all)).toEqual([]);
  });
});

describe("sortPoliciesForAdmin", () => {
  it("puts the storefront-linked policies first, in link order", () => {
    const sorted = sortPoliciesForAdmin([
      policy({ slug: "cookies", label: "Cookies" }),
      policy({ slug: "payment", label: "Payment" }),
      policy({ slug: "privacy", label: "Privacy" }),
    ]);
    expect(sorted.map((p) => p.slug)).toEqual(["privacy", "payment", "cookies"]);
  });

  it("orders unlinked policies by label rather than by query order", () => {
    const sorted = sortPoliciesForAdmin([
      policy({ slug: "zebra", label: "Zebra" }),
      policy({ slug: "cookies", label: "Cookies" }),
    ]);
    expect(sorted.map((p) => p.slug)).toEqual(["cookies", "zebra"]);
  });
});

describe("policyWordCount", () => {
  it("counts words, not tags", () => {
    expect(policyWordCount("<p>We keep your data safe.</p>")).toBe(5);
  });

  it("reports an empty editor as zero rather than one", () => {
    // The rich-text editor leaves <p></p> behind when everything is deleted.
    expect(policyWordCount("<p></p>")).toBe(0);
    expect(policyWordCount("<p>&nbsp;</p>")).toBe(0);
    expect(policyWordCount("")).toBe(0);
  });
});
