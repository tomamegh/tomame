import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

import { AdminBadge } from "@/components/layout/admin";
import {
  policyLinkBadge,
  policyLinkState,
  policyWordCount,
} from "@/features/policies/format";
import type { PolicyRow } from "@/features/policies/types";

/**
 * The policy list.
 *
 * A SERVER component now. It was a client component whose only interactivity
 * was a Motion stagger over a list of links — a whole hydration boundary spent
 * on an entrance animation the v2 `tm-up` keyframe does in CSS. Nothing here
 * has state, so nothing here needs to ship.
 *
 * Each row leads with what the policy IS to a customer — live, a dead link, a
 * draft — rather than with the raw `is_published` boolean, because the two are
 * not the same fact: an unpublished policy nothing links to is a harmless
 * draft, and an unpublished `payment` is a broken link under the Pay button.
 */
export function PoliciesList({ policies }: { policies: readonly PolicyRow[] }) {
  return (
    <ul className="divide-y divide-tm-hairline">
      {policies.map((policy) => {
        const state = policyLinkState(policy);
        const badge = policyLinkBadge(state);
        const words = policyWordCount(policy.content);

        return (
          <li key={policy.slug}>
            <Link
              href={`/admin/policies/${policy.slug}`}
              className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-tm-paper focus-visible:bg-tm-paper focus-visible:outline-none"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[14px] leading-none font-semibold text-tm-ink">
                    {policy.label}
                  </p>
                  <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
                </div>
                <p className="mt-1.5 truncate text-[12px] leading-[1.4] font-medium text-tm-text-3">
                  <span className="tm-nums">/policies#{policy.slug}</span>
                  {" · "}
                  {words === 0 ? (
                    // An empty policy that is published is worse than a draft:
                    // the anchor exists and the section is blank.
                    <span className="font-semibold text-tm-coral-strong">Nothing written yet</span>
                  ) : (
                    <span className="tm-nums">
                      {words.toLocaleString("en-GB")} {words === 1 ? "word" : "words"}
                    </span>
                  )}
                  {policy.effective_date ? ` · Effective ${policy.effective_date}` : null}
                </p>
              </div>

              <ChevronRightIcon
                className="size-4 shrink-0 text-tm-text-3 transition-colors group-hover:text-tm-ink"
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
