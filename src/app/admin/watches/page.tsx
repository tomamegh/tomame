import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminPage,
  AdminStat,
} from "@/components/layout/admin";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import {
  budgetPeriod,
  getAdminWatchCounts,
  listFailingWatches,
  listJobBudgets,
  listPriceDropAlerts,
  listWatchesForAdmin,
} from "@/db/queries/admin-watches";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import { AdminWatchesTable } from "@/features/watches/components/admin-watches-table";
import {
  jobHealth,
  jobHealthMessage,
  unmeteredSpendNote,
} from "@/features/watches/components/admin-watch-format";
import {
  notificationStatusBadge,
  recipientLabel,
  relativeTime,
} from "@/features/notifications/components/admin-notification-format";
import { formatCount } from "@/features/admin/components/dashboard-format";
import { formatPercent } from "@/features/marketing/format";
import { PRICE_WATCH_JOB } from "@/config/security";

import type { Metadata } from "next";
import { canAccessAdmin } from "@/lib/auth/admin-access";

export const metadata: Metadata = {
  title: "Price watches · Tomame admin",
  description: "Products customers asked us to re-check.",
};

/**
 * `/admin/watches` — is the price-watch batch still working, and for whom is it
 * not.
 *
 * A customer who puts a product on watch is told something is looking at it
 * every day. Nothing in the admin has ever shown whether that is true. The job
 * fails quietly by design — a watch that fails five times is retired and simply
 * stops, and the customer is not told — so the failing list on this page is the
 * only warning anybody gets.
 *
 * Read-only. A watch belongs to a customer, and none of pausing, re-arming or
 * deleting one has a server-side path an admin is meant to use; a button that
 * wrote directly to the table would sidestep the service that owns the
 * baselines and the notification reference point.
 *
 * VENDOR SPEND. Every re-check is a paid extraction, and the price-watch job
 * records NOTHING in `job_budgets` — migration 045 meters `catalog-scrape`
 * only. So this screen reports the number of successful checks, which is a real
 * count, and states plainly that they are unmetered rather than printing a
 * comforting zero against a cap that does not exist.
 */
export default async function AdminWatchesPage() {
  const viewer = await getAuthenticatedUser();
  if (!viewer || !canAccessAdmin(viewer)) notFound();

  const now = new Date();

  const [counts, watches, failing, alerts, budgets, constants] = await Promise.all([
    getAdminWatchCounts(now),
    listWatchesForAdmin(100),
    listFailingWatches(25),
    listPriceDropAlerts(15),
    listJobBudgets(budgetPeriod(now)).catch(() => []),
    getPricingConstantsMap().catch(() => ({}) as Record<string, number>),
  ]);

  // The newest check across the sample answers "has the job run at all". The
  // list is ordered by `updated_at`, so a check anywhere in it counts.
  const lastCheckedAt = watches.reduce<string | null>((latest, watch) => {
    if (!watch.last_checked_at) return latest;
    if (!latest || watch.last_checked_at > latest) return watch.last_checked_at;
    return latest;
  }, null);

  const health = jobHealth({ activeWatches: counts.active, lastCheckedAt, now });
  const healthMessage = jobHealthMessage(health);

  // The alert threshold lives in pricing_constants (052) so moving it is an
  // admin edit, not a deploy. A missing or out-of-range row means NO alerts are
  // sent — the job refuses to invent one — so that case is stated rather than
  // shown as a percentage.
  const threshold = constants.price_drop_notify_pct;
  const thresholdValid = typeof threshold === "number" && threshold > 0 && threshold < 1;

  return (
    <AdminPage
      title="Price watches"
      blurb={`Customers are told a watched product is re-checked for them. Each watch comes round about every ${PRICE_WATCH_JOB.recheckAfterHours} hours, in batches of ${PRICE_WATCH_JOB.batchSize}.`}
      action={<AdminBadge tone={healthMessage.tone}>{healthMessage.label}</AdminBadge>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          index={0}
          label="Being checked"
          value={formatCount(counts.active)}
          detail={`${formatCount(counts.checkedLast24h)} checked in the last 24 hours`}
          tone={counts.active > 0 ? "green" : "muted"}
        />
        <AdminStat
          index={1}
          label="Failing"
          value={formatCount(counts.failing)}
          detail={
            counts.failing > 0
              ? `Retired after ${PRICE_WATCH_JOB.maxConsecutiveFailures} consecutive failures`
              : "Every active watch checked cleanly"
          }
          tone={counts.failing > 0 ? "amber" : "green"}
        />
        <AdminStat
          index={2}
          label="Retired by the job"
          value={formatCount(counts.retired)}
          detail="The customer was never told these stopped"
          tone={counts.retired > 0 ? "coral" : "green"}
        />
        <AdminStat
          index={3}
          label="Alerts sent this week"
          value={formatCount(counts.alertsLast7d)}
          detail={
            thresholdValid
              ? `Price must fall ${formatPercent(threshold)} below what the customer was last told`
              : "No threshold is configured, so the job sends nothing"
          }
          tone={thresholdValid ? "neutral" : "coral"}
          href="/admin/notifications?event=price_drop"
        />
      </div>

      <AdminCard index={1} title="The job" blurb={healthMessage.body}>
        <div className="flex flex-col gap-4">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Last check recorded">
              {lastCheckedAt ? (relativeTime(lastCheckedAt, now) ?? "—") : "Never"}
            </Fact>
            <Fact label="Never checked yet">
              {formatCount(counts.neverChecked)}
            </Fact>
            <Fact label="Stopped by customers">
              {formatCount(counts.pausedByCustomer)}
            </Fact>
            <Fact label="Successful checks (7 days)">
              {formatCount(counts.observationsLast7d)}
            </Fact>
          </dl>

          <p className="max-w-[76ch] rounded-[14px] bg-tm-paper px-4 py-3 text-[13px] leading-[1.5] font-medium text-tm-text-2">
            {unmeteredSpendNote(counts.observationsLast7d)}
          </p>

          {budgets.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] leading-none font-semibold text-tm-text-2">
                Metered vendor spend this month ({budgetPeriod(now)})
              </span>
              <ul className="flex flex-wrap gap-2">
                {budgets.map((budget) => (
                  <li key={budget.job}>
                    <AdminBadge tone={budget.used >= budget.cap ? "coral" : "neutral"}>
                      <span className="tm-nums">
                        {budget.job}: {formatCount(budget.used)} of {formatCount(budget.cap)}
                      </span>
                    </AdminBadge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </AdminCard>

      {failing.length > 0 ? (
        <AdminCard
          index={2}
          title="Watches that are failing"
          blurb={`Worst first. A watch is retired after ${PRICE_WATCH_JOB.maxConsecutiveFailures} consecutive failures and stops being checked. The customer is not told, so this list is the only warning.`}
          flush
        >
          <AdminWatchesTable rows={failing} now={now} showError />
        </AdminCard>
      ) : null}

      <AdminCard
        index={3}
        title="All watches"
        blurb={
          watches.length >= 100
            ? "The 100 most recently touched. Ordered by last activity, not by age."
            : "Ordered by last activity, not by age."
        }
        flush={watches.length > 0}
      >
        {watches.length === 0 ? (
          <AdminEmpty
            title="Nobody is watching anything"
            body="No customer has put a product on watch, so the batch has nothing to claim and costs nothing to run. Watches are created from the quote screen and the account's price-watch panel."
          />
        ) : (
          <AdminWatchesTable rows={watches} now={now} />
        )}
      </AdminCard>

      <AdminCard
        index={4}
        title="Price-drop alerts"
        blurb="What was actually sent. A watch stamped with an alert whose message failed is a customer who was never told."
        action={
          <Link
            href="/admin/notifications?event=price_drop"
            className="text-[12px] leading-none font-semibold text-tm-text-2 underline underline-offset-2 hover:text-tm-ink"
          >
            Full log
          </Link>
        }
      >
        {alerts.length === 0 ? (
          <AdminEmpty
            title="No price-drop alert has ever been sent"
            body={
              thresholdValid
                ? `Nothing has fallen ${formatPercent(threshold)} below the price its watcher was last told about. That is the normal state most weeks. The threshold exists so a small wobble does not train customers to ignore the alert.`
                : "There is no valid price_drop_notify_pct in pricing_constants, so the job refuses to send anything rather than invent a threshold. Set it on the pricing screen."
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-tm-hairline">
            {alerts.map((alert) => {
              const badge = notificationStatusBadge(alert.status);
              return (
                <li
                  key={alert.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/users/${alert.user_id}`}
                      className="truncate text-[13px] leading-none font-semibold text-tm-ink underline-offset-2 hover:underline"
                    >
                      {recipientLabel(null, alert.user_id)}
                    </Link>
                    <p className="tm-nums mt-1.5 text-[12px] leading-none font-medium text-tm-text-3">
                      {relativeTime(alert.created_at, now) ?? "—"}
                    </p>
                  </div>
                  <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
                </li>
              );
            })}
          </ul>
        )}
      </AdminCard>
    </AdminPage>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-[12px] leading-none font-semibold text-tm-text-2">{label}</dt>
      <dd className="tm-nums text-[14px] leading-none font-semibold text-tm-ink">{children}</dd>
    </div>
  );
}
