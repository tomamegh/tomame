import {
  MARKETING_NAV_ITEMS,
  MarketingFooter,
  MarketingNav,
  type MarketingNavItem,
  type MarketingPolicyLink,
} from "@/components/layout/marketing";
import { getMarketingSettings } from "@/features/marketing/services";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthenticated } from "@/lib/supabase/current-user";

/**
 * There is no `/how-it-works` route: the steps live in a section of the
 * landing page, so the nav anchors there rather than 404ing.
 */
const NAV_ITEMS: readonly MarketingNavItem[] = MARKETING_NAV_ITEMS.map((item) =>
  item.key === "how" ? { ...item, href: "/#how-it-works" } : item,
);

/** Published policies drive the footer's Legal column. */
async function loadPolicyLinks(): Promise<MarketingPolicyLink[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("policies")
    .select("slug, label")
    .eq("is_published", true);

  return (data ?? []) as MarketingPolicyLink[];
}

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, policies, authed] = await Promise.all([
    getMarketingSettings(),
    loadPolicyLinks(),
    isAuthenticated(),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-card">
      <MarketingNav items={NAV_ITEMS} isAuthenticated={authed} />
      <main className="flex-1">{children}</main>
      <MarketingFooter settings={settings} policies={policies} />
    </div>
  );
}
