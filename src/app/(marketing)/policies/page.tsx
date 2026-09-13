import { createAdminClient } from "@/lib/supabase/admin";
import { whatsappHref } from "@/components/layout/marketing/links";
import { getMarketingSettings } from "@/features/marketing/services";
import type { PolicyRow } from "@/features/policies/types";
import { PoliciesContent } from "./policies-content";

// Policies change rarely; revalidate hourly so admin edits surface without a
// redeploy while still serving a cached page to visitors.
export const revalidate = 3600;

// Preferred reading order on the public page, independent of insert order.
const SLUG_ORDER = ["privacy", "terms", "shipping", "returns", "payment"];

function sortByPreferredOrder(policies: PolicyRow[]): PolicyRow[] {
  return [...policies].sort((a, b) => {
    const ai = SLUG_ORDER.indexOf(a.slug);
    const bi = SLUG_ORDER.indexOf(b.slug);
    return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
  });
}

export default async function PoliciesPage() {
  const db = createAdminClient();
  const [{ data }, settings] = await Promise.all([
    db
      .from("policies")
      .select(
        "id, slug, label, content, effective_date, last_updated, is_published",
      )
      .eq("is_published", true),
    // The "questions?" block at the foot of the page names the WhatsApp line
    // from `site_settings` — the same row the footer and the contact page read.
    getMarketingSettings(),
  ]);

  const policies = sortByPreferredOrder((data ?? []) as PolicyRow[]);

  return (
    <PoliciesContent
      policies={policies}
      contact={{
        whatsappNumber: settings.whatsappNumber,
        whatsappHref: whatsappHref(settings.whatsappNumber),
        supportHours: settings.supportHours,
      }}
    />
  );
}
