import Link from "next/link";
import { PlusIcon } from "lucide-react";

import {
  AdminCard,
  AdminEmpty,
  AdminPage,
  AdminStat,
} from "@/components/layout/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  LINKED_POLICY_SLUGS,
  brokenPolicyLinks,
  sortPoliciesForAdmin,
} from "@/features/policies/format";
import type { PolicyRow } from "@/features/policies/types";

import { PoliciesList } from "./policies-list";

/**
 * `/admin/policies` — the legal pages, and whether the links pointing at them
 * actually land anywhere.
 *
 * A server component reading `policies` directly through the service-role
 * client, because the table has RLS on with no policies at all (migration 033):
 * service role is the only way in, and `src/proxy.ts` has already established
 * that the caller is an admin before this renders.
 *
 * The screen leads with the broken-link count rather than a row count. The
 * publish flag here is load-bearing in a way it is not on an ordinary CMS —
 * five slugs are linked by anchor from the footer, the bag and the account
 * screen, and `/policies` renders published rows only, so an unpublished one is
 * a dead link a customer meets seconds before paying.
 */
export default async function AdminPoliciesPage() {
  const db = createAdminClient();
  const { data } = await db
    .from("policies")
    .select("id, slug, label, content, effective_date, last_updated, is_published");

  const policies = sortPoliciesForAdmin((data ?? []) as PolicyRow[]);
  const broken = brokenPolicyLinks(policies);
  const published = policies.filter((policy) => policy.is_published).length;

  return (
    <AdminPage
      title="Policies"
      blurb="The legal pages customers are sent to from the footer, the bag and their account. Only published policies appear on /policies."
      action={
        <Link
          href="/admin/policies/new"
          className="tm-cta-gradient inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          <PlusIcon className="size-4" aria-hidden />
          New policy
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <AdminStat
          index={0}
          label="Published"
          value={`${published}`}
          detail={`of ${policies.length} written`}
          tone={published > 0 ? "green" : "muted"}
        />
        <AdminStat
          index={1}
          label="Links that go nowhere"
          value={`${broken.length}`}
          detail={
            broken.length === 0
              ? "Every linked policy is live"
              : broken.map((entry) => `/policies#${entry.slug}`).join(", ")
          }
          tone={broken.length === 0 ? "green" : "coral"}
        />
        <AdminStat
          index={2}
          label="Linked from the storefront"
          value={`${LINKED_POLICY_SLUGS.length}`}
          detail="Footer, bag summary and account"
          tone="neutral"
        />
      </div>

      {broken.length > 0 ? (
        <AdminCard
          index={1}
          title="These links are live and lead to nothing"
          blurb="The storefront links to each of these by anchor. An unpublished or missing policy renders no section on /policies, so the customer lands on the page and finds nothing there."
        >
          <ul className="flex flex-col gap-2">
            {broken.map((entry) => (
              <li
                key={entry.slug}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-tm-pill-bg px-4 py-3"
              >
                <span className="text-[13px] leading-none font-semibold text-tm-coral-strong">
                  /policies#{entry.slug}
                </span>
                <span className="text-[13px] leading-none font-medium text-tm-text-2">
                  {entry.reason === "missing"
                    ? "No policy with this slug exists yet"
                    : "Written, but not published"}
                </span>
                {entry.reason === "missing" ? (
                  <Link
                    href="/admin/policies/new"
                    className="text-[13px] leading-none font-semibold text-tm-coral-strong underline underline-offset-2"
                  >
                    Create it
                  </Link>
                ) : (
                  <Link
                    href={`/admin/policies/${entry.slug}`}
                    className="text-[13px] leading-none font-semibold text-tm-coral-strong underline underline-offset-2"
                  >
                    Open and publish
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}

      <AdminCard
        index={2}
        title="All policies"
        blurb="/policies is cached for an hour, so a change can take that long to appear for customers."
        flush={policies.length > 0}
      >
        {policies.length === 0 ? (
          <AdminEmpty
            title="No policies yet"
            body="Nothing has been written. The footer, the bag and the account screen all link to five policies by name — privacy, terms, shipping, returns and payment — and every one of those links currently goes nowhere."
          >
            <Link
              href="/admin/policies/new"
              className="tm-cta-gradient mt-1 inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <PlusIcon className="size-4" aria-hidden />
              Write the first one
            </Link>
          </AdminEmpty>
        ) : (
          <PoliciesList policies={policies} />
        )}
      </AdminCard>
    </AdminPage>
  );
}
