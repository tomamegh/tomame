import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminPage,
  AdminTableScroller,
} from "@/components/layout/admin";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import {
  countWaitlistSignups,
  listAllDeliveryZones,
  listAllRegions,
  listAllSiteContent,
  listAllSiteSettings,
  listMediaOverrides,
  listWaitlistSignups,
} from "@/db/queries/admin-content";
import { isBuilderEnabled } from "@/config/builder";
import { AdminBlocksPanel } from "@/features/marketing/components/admin-blocks-panel";
import { AdminBuilderPanel } from "@/features/marketing/components/admin-builder-panel";
import { AdminRegionsPanel } from "@/features/marketing/components/admin-regions-panel";
import { AdminSettingsPanel } from "@/features/marketing/components/admin-settings-panel";
import { AdminZonesPanel } from "@/features/marketing/components/admin-zones-panel";
import { formatCount } from "@/features/admin/components/dashboard-format";
import { formatJoined } from "@/features/users/components/admin-user-format";
import { cn } from "@/lib/utils";

import type { Metadata } from "next";
import { canAccessAdmin } from "@/lib/auth/admin-access";

export const metadata: Metadata = {
  title: "Content · Tomame admin",
  description: "The marketing site's admin-owned tables.",
};

/**
 * `/admin/content` — the marketing site's own tables, administered.
 *
 * WHY THIS SCREEN EXISTS. Migrations 036–040 gave the storefront an
 * admin-owned content layer and then never gave it an admin. `site_settings`,
 * `site_content`, `regions`, `delivery_zones`, `waitlist_signups` and
 * `media_overrides` have all been edited by hand in SQL since they shipped — a
 * delivery fee charged at checkout, the WhatsApp number customers message, and
 * the switch that decides whether the UK lane is purchasable were all `UPDATE`
 * statements somebody typed into a console.
 *
 * ONE TAB'S DATA AT A TIME. The tab is a URL (`?tab=`), not client state, so
 * only one set of queries runs per render and a tab is a link an admin can
 * bookmark. The screen ships no JavaScript of its own; the four editable tabs
 * mount small client forms, each of which writes through
 * `PATCH /api/admin/content`.
 *
 * Everything on it is live to customers on their next page load, except the
 * blocks that `/policies` and other cached routes render — the cards say so
 * where it applies.
 */

type ContentTab = "settings" | "regions" | "zones" | "blocks" | "waitlist" | "media";

const TABS: { value: ContentTab; label: string }[] = [
  { value: "settings", label: "Settings" },
  { value: "regions", label: "Lanes" },
  { value: "zones", label: "Delivery zones" },
  { value: "blocks", label: "Copy blocks" },
  { value: "waitlist", label: "Waitlist" },
  { value: "media", label: "Photo builder" },
];

const TAB_BLURBS: Record<ContentTab, string> = {
  settings:
    "The values the storefront reads from site_settings: the WhatsApp number, support hours, the payment channels offered at checkout and the Fees worked example.",
  regions:
    "Which purchasing lanes are live. This is the switch that decides whether a customer can buy from a region or is offered a waitlist instead.",
  zones:
    "Ghana-side delivery, and the fee added once per checkout on the zone a customer picks. Fee changes are confirmed and audited.",
  blocks:
    "The marketing copy: FAQs, process steps, feature cards, fee lines and the quote screen's assurance cards. Unpublished blocks are filtered out of every storefront read.",
  waitlist: "People who asked to be told when a lane opens.",
  media:
    "The photography on the marketing site, one page at a time. Open the builder on a page to replace a photo or drag its crop; what each photo is doing now is folded under the page it belongs to.",
};

function parseTab(value: string | string[] | undefined): ContentTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return TABS.some((tab) => tab.value === raw) ? (raw as ContentTab) : "settings";
}

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getAuthenticatedUser();
  if (!viewer || !canAccessAdmin(viewer)) notFound();

  const tab = parseTab((await searchParams).tab);

  return (
    <AdminPage
      title="Content"
      blurb="The marketing site's admin-owned tables. Every change here reaches customers without a deploy."
    >
      <nav
        aria-label="Content sections"
        className="tm-up flex flex-wrap gap-1.5 [animation-duration:0.5s]"
      >
        {TABS.map((entry) => {
          const active = entry.value === tab;
          return (
            <Link
              key={entry.value}
              href={`/admin/content?tab=${entry.value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full border px-3.5 py-2 text-[13px] leading-none font-semibold transition-colors",
                active
                  ? "border-tm-coral/40 bg-tm-pill-bg text-tm-coral-strong"
                  : "border-tm-border bg-card text-tm-text-2 hover:bg-tm-paper",
              )}
            >
              {entry.label}
            </Link>
          );
        })}
      </nav>

      {tab === "settings" ? <SettingsTab /> : null}
      {tab === "regions" ? <RegionsTab /> : null}
      {tab === "zones" ? <ZonesTab /> : null}
      {tab === "blocks" ? <BlocksTab /> : null}
      {tab === "waitlist" ? <WaitlistTab /> : null}
      {tab === "media" ? <MediaTab /> : null}
    </AdminPage>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

async function SettingsTab() {
  const settings = await listAllSiteSettings();

  return (
    <AdminCard index={1} title="Site settings" blurb={TAB_BLURBS.settings}>
      {settings.length === 0 ? (
        <AdminEmpty
          title="No settings stored"
          body="site_settings has no rows. Migration 037 seeds five and 048 adds a sixth, so an empty table means the marketing seed has not been applied to this database."
        />
      ) : (
        <AdminSettingsPanel settings={settings} />
      )}
    </AdminCard>
  );
}

async function RegionsTab() {
  const regions = await listAllRegions();
  const live = regions.filter((region) => region.status === "live").length;

  return (
    <AdminCard
      index={1}
      title="Purchasing lanes"
      blurb={TAB_BLURBS.regions}
      action={
        <AdminBadge tone={live > 0 ? "green" : "coral"}>
          {live === 0
            ? "No lane is live"
            : `${live} of ${regions.length} live`}
        </AdminBadge>
      }
    >
      {regions.length === 0 ? (
        <AdminEmpty
          title="No lanes configured"
          body="regions has no rows, so “Where we buy” has nothing to show and no region can be bought from. Migration 037 seeds the USA, UK and China lanes."
        />
      ) : (
        <AdminRegionsPanel regions={regions} />
      )}
    </AdminCard>
  );
}

async function ZonesTab() {
  const zones = await listAllDeliveryZones();
  const active = zones.filter((zone) => zone.is_active);

  return (
    <AdminCard
      index={1}
      title="Delivery zones"
      blurb={TAB_BLURBS.zones}
      action={
        <AdminBadge tone={active.length > 0 ? "green" : "coral"}>
          {active.length === 0
            ? "None offered at checkout"
            : `${active.length} offered at checkout`}
        </AdminBadge>
      }
    >
      {zones.length === 0 ? (
        <AdminEmpty
          title="No delivery zones"
          body="delivery_zones has no rows. Checkout has nothing to offer and the marketing site's “delivery from” figure has nothing to derive from. Migration 037 seeds the Accra and pickup zones."
        />
      ) : (
        <AdminZonesPanel zones={zones} />
      )}
    </AdminCard>
  );
}

async function BlocksTab() {
  const blocks = await listAllSiteContent();
  const hidden = blocks.filter((block) => !block.is_published).length;

  return (
    <AdminCard
      index={1}
      title="Copy blocks"
      blurb={TAB_BLURBS.blocks}
      action={
        hidden > 0 ? (
          <AdminBadge tone="amber">{formatCount(hidden)} hidden</AdminBadge>
        ) : (
          <AdminBadge tone="green">All published</AdminBadge>
        )
      }
    >
      {blocks.length === 0 ? (
        <AdminEmpty
          title="No copy blocks"
          body="site_content has no rows, so the landing page, the Fees page and the quote screen's assurance cards have nothing to render. Migrations 037, 038 and 047 seed them."
        />
      ) : (
        <AdminBlocksPanel blocks={blocks} />
      )}
    </AdminCard>
  );
}

async function WaitlistTab() {
  const [signups, total] = await Promise.all([
    listWaitlistSignups(200),
    countWaitlistSignups(),
  ]);

  // Counted from the rows on screen, and labelled as such — the list is capped,
  // so this is "of the newest 200" and the card says so rather than presenting
  // it as an all-time split.
  const byRegion = new Map<string, number>();
  for (const signup of signups) {
    byRegion.set(signup.region_code, (byRegion.get(signup.region_code) ?? 0) + 1);
  }

  return (
    <AdminCard
      index={1}
      title="Waitlist"
      blurb={TAB_BLURBS.waitlist}
      action={
        <AdminBadge tone={total > 0 ? "neutral" : "muted"}>
          {formatCount(total)} {total === 1 ? "signup" : "signups"}
        </AdminBadge>
      }
      flush={signups.length > 0}
    >
      {signups.length === 0 ? (
        <AdminEmpty
          title="Nobody is waiting"
          body="No one has asked to be told when a lane opens. The form only appears on lanes whose status is “Coming soon”, so if a lane you expect to collect signups is set to Live or Hidden, that is why."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 px-5 py-4">
            {[...byRegion.entries()].map(([code, count]) => (
              <AdminBadge key={code} tone="neutral">
                {code}: {formatCount(count)}
              </AdminBadge>
            ))}
            {signups.length < total ? (
              <span className="tm-nums self-center text-[12px] leading-none font-medium text-tm-text-3">
                counted over the newest {formatCount(signups.length)} of {formatCount(total)}
              </span>
            ) : null}
          </div>
          <AdminTableScroller>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={ADMIN_TH}>
                    Email
                  </th>
                  <th scope="col" className={ADMIN_TH}>
                    Phone
                  </th>
                  <th scope="col" className={ADMIN_TH}>
                    Lane
                  </th>
                  <th scope="col" className={ADMIN_TH}>
                    Signed up
                  </th>
                  <th scope="col" className={ADMIN_TH}>
                    Told
                  </th>
                </tr>
              </thead>
              <tbody>
                {signups.map((signup) => (
                  <tr key={signup.id} className={ADMIN_TR}>
                    <td className={ADMIN_TD}>{signup.email}</td>
                    <td className={`${ADMIN_TD} tm-nums text-tm-text-2`}>
                      {signup.phone ?? "—"}
                    </td>
                    <td className={ADMIN_TD}>
                      <AdminBadge tone="neutral">{signup.region_code}</AdminBadge>
                    </td>
                    <td className={`${ADMIN_TD} tm-nums whitespace-nowrap text-tm-text-2`}>
                      {formatJoined(signup.created_at) ?? "—"}
                    </td>
                    <td className={`${ADMIN_TD} tm-nums whitespace-nowrap text-tm-text-2`}>
                      {/*
                        `notified_at` is stamped by whatever tells the waitlist a
                        lane has opened. Nothing writes it yet, so it reads as a
                        dash — an honest "not yet", not a claim that they were
                        told.
                      */}
                      {formatJoined(signup.notified_at) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableScroller>
        </>
      )}
    </AdminCard>
  );
}

async function MediaTab() {
  const overrides = await listMediaOverrides();
  const changed = overrides.length;

  return (
    <AdminCard
      index={1}
      title="Photo builder"
      blurb={TAB_BLURBS.media}
      flush
      action={
        <AdminBadge tone={changed > 0 ? "coral" : "muted"}>
          {changed === 0
            ? "All manifest defaults"
            : `${formatCount(changed)} ${changed === 1 ? "photo" : "photos"} changed`}
        </AdminBadge>
      }
    >
      <AdminBuilderPanel overrides={overrides} builderEnabled={isBuilderEnabled()} />
    </AdminCard>
  );
}
