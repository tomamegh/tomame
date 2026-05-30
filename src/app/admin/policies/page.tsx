import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PolicyRow } from "@/features/policies/types";
import { PoliciesList } from "./policies-list";

const SLUG_ORDER = ["privacy", "terms", "shipping", "returns", "payment"];

function sortByPreferredOrder(policies: PolicyRow[]): PolicyRow[] {
  return [...policies].sort((a, b) => {
    const ai = SLUG_ORDER.indexOf(a.slug);
    const bi = SLUG_ORDER.indexOf(b.slug);
    return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
  });
}

export default async function AdminPoliciesPage() {
  const db = createAdminClient();
  const { data } = await db
    .from("policies")
    .select(
      "id, slug, label, content, effective_date, last_updated, is_published",
    );

  const policies = sortByPreferredOrder((data ?? []) as PolicyRow[]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Policies</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            Edit the legal pages shown to customers. Drafts stay hidden until
            published.
          </p>
        </div>
        <Link
          href="/admin/policies/new"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <PlusIcon className="size-4" />
          New Policy
        </Link>
      </div>

      {policies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-600">No policies yet</p>
          <p className="mt-2 text-xs text-slate-400">
            Create your first policy or{" "}
            <span className="font-medium text-slate-500">
              run the seed to populate the default legal pages.
            </span>
          </p>
          <Link
            href="/admin/policies/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <PlusIcon className="size-4" />
            Create a policy
          </Link>
        </div>
      ) : (
        <PoliciesList policies={policies} />
      )}
    </div>
  );
}
