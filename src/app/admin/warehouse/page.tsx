import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BoxIcon,
  LockIcon,
  PackageCheckIcon,
  PrinterIcon,
  TruckIcon,
} from "lucide-react";

import {
  AdminCard,
  AdminEmpty,
  AdminFilterPills,
  AdminPage,
  AdminStat,
} from "@/components/layout/admin";
import { formatCount, formatDayKey, pluralise } from "@/features/admin/components/dashboard-format";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { ActivityTimeline } from "@/features/warehouse-insights/components/activity-timeline";
import {
  DurationPanel,
  IssuesPanel,
  OperatorTable,
  PackageStatusPanel,
} from "@/features/warehouse-insights/components/insight-panels";
import { ThroughputChart } from "@/features/warehouse-insights/components/throughput-chart";
import { TimelineFiltersForm } from "@/features/warehouse-insights/components/timeline-filters";
import {
  RANGES,
  insightsHref,
  parseRange,
  parseTimelineFilters,
} from "@/features/warehouse-insights/filters";
import {
  getWarehouseInsights,
  listStaff,
  listWarehouseTimeline,
} from "@/features/warehouse-insights/services/insights.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";

export const metadata: Metadata = {
  title: "Warehouse activity · Admin",
  description: "How the US hub is working, and who did what.",
};
export const dynamic = "force-dynamic";

/**
 * `/admin/warehouse` — the hub, seen from the admin (082).
 *
 * ADMIN ONLY. `src/proxy.ts` sends a warehouse operator who types `/admin/*`
 * back to `/warehouse`, and the role is re-checked here before anything is read
 * (the `/admin/users` pattern): this page lists every operator's trail side by
 * side, and an operator passes every warehouse check in the codebase. The
 * services check `requireAdmin` a third time.
 *
 * Two halves. The top is analytics over a 7/30/90-day range; the bottom is the
 * timeline, filtered and paged independently in the same URL, so "everything
 * Yaw did on Tuesday" is a link.
 */
export default async function AdminWarehousePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getAuthenticatedUser();
  if (!viewer || !canAccessAdmin(viewer)) notFound();

  const params = await searchParams;
  const range = parseRange(params.range);
  const filters = parseTimelineFilters(params);
  const now = new Date();

  const [insights, timeline, staff] = await Promise.all([
    getWarehouseInsights(viewer, range, now),
    listWarehouseTimeline(viewer, filters),
    listStaff(viewer),
  ]);
  const { totals } = insights;
  const rangeLabel = `${formatDayKey(insights.since.slice(0, 10))} – today`;
  const busiest = insights.throughput.reduce(
    (best, d) => (d.received + d.shipped > best.received + best.shipped ? d : best),
    insights.throughput[0] ?? { day: "", received: 0, shipped: 0 },
  );

  const rangePills = RANGES.map((r) => ({
    label: `${r} days`,
    href: insightsHref(params, { range: String(r) }),
    active: r === range,
  }));

  return (
    <AdminPage
      title="Warehouse activity"
      blurb="How the US hub is working: what came in, what left, how long it waited, and who did it. Page views and scans are recorded alongside every audited change."
      action={<AdminFilterPills pills={rangePills} label="Insights range" />}
    >
      {insights.truncated ? (
        <p className="rounded-[14px] bg-tm-amber-bg px-4 py-3 text-[13px] font-medium text-[#7a4a06]">
          This range holds more rows than one page reads, so the figures below are a floor. Pick a shorter range for exact counts.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <AdminStat
          index={0}
          label="Logged in"
          value={formatCount(totals.received)}
          detail={totals.reweighed > 0 ? `+ ${pluralise(totals.reweighed, "re-weigh")}` : "Parcels received at the hub"}
          tone={totals.received > 0 ? "neutral" : "muted"}
          icon={<PackageCheckIcon className="size-4" />}
          href={insightsHref(params, { kind: "received" }) + "#activity"}
        />
        <AdminStat
          index={1}
          label="Packed"
          value={formatCount(totals.packed)}
          detail="Items put into packages"
          tone={totals.packed > 0 ? "neutral" : "muted"}
          icon={<BoxIcon className="size-4" />}
          href={insightsHref(params, { kind: "packing" }) + "#activity"}
        />
        <AdminStat
          index={2}
          label="Sealed"
          value={formatCount(totals.sealed)}
          detail="Packages taped and labelled"
          tone={totals.sealed > 0 ? "neutral" : "muted"}
          icon={<LockIcon className="size-4" />}
          href={insightsHref(params, { kind: "packing" }) + "#activity"}
        />
        <AdminStat
          index={3}
          label="Shipped"
          value={formatCount(totals.shipped)}
          detail={`${pluralise(totals.shipped_orders, "order")} left the hub`}
          tone={totals.shipped > 0 ? "green" : "muted"}
          icon={<TruckIcon className="size-4" />}
          href={insightsHref(params, { kind: "shipped" }) + "#activity"}
        />
        <AdminStat
          index={4}
          label="Labels printed"
          value={formatCount(totals.labels)}
          detail="Every copy counts"
          tone={totals.labels > 0 ? "neutral" : "muted"}
          icon={<PrinterIcon className="size-4" />}
          href={insightsHref(params, { kind: "labels" }) + "#activity"}
        />
      </div>

      <AdminCard
        index={1}
        title="Throughput"
        blurb={
          busiest.received + busiest.shipped > 0
            ? `${rangeLabel}. Busiest day: ${formatDayKey(busiest.day)}, ${busiest.received} in and ${busiest.shipped} out.`
            : `${rangeLabel}. Nothing came in or went out in this range.`
        }
      >
        <ThroughputChart days={insights.throughput} />
      </AdminCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <AdminCard index={2} title="Time at the hub" blurb={`Packages shipped since ${formatDayKey(insights.since.slice(0, 10))}.`}>
          <DurationPanel insights={insights} />
        </AdminCard>
        <AdminCard index={3} title="Packages now" blurb="Where every package is right now, whatever the range.">
          <PackageStatusPanel counts={insights.packages_by_status} />
        </AdminCard>
        <AdminCard index={4} title="Issues" blurb="Holds, customer complaints about parcel photos, and scans that found nothing.">
          <IssuesPanel issues={insights.issues} now={now} range={range} />
        </AdminCard>
      </div>

      <AdminCard
        index={5}
        title="People"
        blurb={`Everyone who worked the hub in the last ${range} days, most recently active first. Sign-ins are not counted as actions.`}
        flush
      >
        <OperatorTable
          operators={insights.operators}
          now={now}
          actorHref={(id) => insightsHref(params, { actor: id }) + "#activity"}
        />
      </AdminCard>

      <div id="activity" className="scroll-mt-6">
        <AdminCard
          index={6}
          title="Activity log"
          blurb="Every audited change at the hub, with scans, label views and (on request) page views, newest first. Times are UTC, which is Ghana's clock."
          flush
        >
          <TimelineFiltersForm
            filters={filters}
            staff={staff}
            range={range}
            clearHref={insightsHref({ range: params.range }, {}) + "#activity"}
          />
          {timeline.entries.length === 0 ? (
            <div className="p-5">
              <AdminEmpty
                title={filters.before ? "No older activity" : "Nothing matches"}
                body={
                  filters.before
                    ? "You have reached the beginning of the trail for this filter."
                    : "No warehouse activity matches these filters. Clear them, or widen the dates."
                }
              >
                <Link
                  href={insightsHref({ range: params.range }, {}) + "#activity"}
                  className="text-[13px] leading-none font-semibold text-tm-coral-strong underline underline-offset-2"
                >
                  Show all activity
                </Link>
              </AdminEmpty>
            </div>
          ) : (
            <ActivityTimeline entries={timeline.entries} now={now} />
          )}
          {filters.before || timeline.next ? (
            <nav
              aria-label="Activity pages"
              className="flex items-center justify-between gap-3 border-t border-tm-hairline px-5 py-3.5"
            >
              {filters.before ? (
                <Link
                  href={insightsHref(params, { before: null }) + "#activity"}
                  className="text-[13px] font-semibold text-tm-text-2 hover:text-tm-ink"
                >
                  ← Newest
                </Link>
              ) : (
                <span />
              )}
              {timeline.next ? (
                <Link
                  href={insightsHref(params, { before: timeline.next }) + "#activity"}
                  className="inline-flex h-9 items-center rounded-full border border-tm-border px-4 text-[13px] font-semibold text-tm-ink transition-colors hover:bg-tm-paper"
                >
                  Older activity →
                </Link>
              ) : null}
            </nav>
          ) : null}
        </AdminCard>
      </div>
    </AdminPage>
  );
}
