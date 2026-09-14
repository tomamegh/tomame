import Link from "next/link";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminStat,
  AdminTableScroller,
  type AdminTone,
} from "@/components/layout/admin";
import type { OpsAlertLevel, OpsOverview } from "@/features/ops/ops.service";
import { ageMinutes, describeMinutes } from "@/features/ops/ops-alerts";
import { formatRelativeTime } from "@/features/app-home/components/format";

/**
 * The operations health screen, rendered server-side from one `getOpsOverview`.
 *
 * Alarms first, because they are the reason the screen exists; the figures
 * beneath them are the evidence. Every age on this page is struck from the
 * server's `generatedAt`, not the browser clock, so a tab left open reads as
 * a snapshot rather than drifting.
 */
export function OpsOverviewView({ view }: { view: OpsOverview }) {
  const now = new Date(view.generatedAt);
  const stuck = view.payments ? view.payments.pending.filter((p) => ageMinutes(p.created_at, now) > view.timeouts.expiryMinutes + 15).length : 0;

  return (
    <div className="flex flex-col gap-6">
      <AdminCard
        title={view.alerts.length === 0 ? "Nothing is wrong" : `${view.alerts.length} thing${view.alerts.length === 1 ? "" : "s"} to look at`}
        blurb="Each line is a failure this platform has had before while looking healthy. A quiet screen means every job ran on time, every payment resolved, and every message went out."
        index={0}
      >
        {view.alerts.length === 0 ? (
          <AdminEmpty title="All clear" body="Every job has a recent heartbeat, no payment is stuck, nothing is pending that should have gone." />
        ) : (
          <ul className="flex flex-col gap-3">
            {view.alerts.map((a, i) => (
              <li key={i} className="flex flex-col gap-1.5 rounded-[14px] bg-tm-paper px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                <AdminBadge tone={levelTone(a.level)} className="shrink-0 self-start">{levelLabel(a.level)}</AdminBadge>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-[14px] leading-[1.3] font-bold text-tm-ink">{a.title}</p>
                  <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">{a.detail}</p>
                  {a.href ? (
                    <Link href={a.href} className="text-[13px] font-semibold text-tm-coral-strong underline-offset-2 hover:underline">
                      Open
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStat
          label="Payments pending"
          value={view.payments ? String(view.payments.pendingTotal) : "n/a"}
          detail={stuck > 0 ? `${stuck} past expiry` : `released after ${view.timeouts.expiryMinutes} min`}
          tone={stuck > 0 ? "coral" : "neutral"}
          href="/admin/transactions?status=pending"
          index={1}
        />
        <AdminStat
          label="Paid in 24h"
          value={view.payments ? String(view.payments.success24h) : "n/a"}
          detail={view.payments ? `${view.payments.failed24h} failed or released` : undefined}
          tone="green"
          index={2}
        />
        <AdminStat
          label="Emails pending"
          value={view.notifications ? String(view.notifications.pending) : "n/a"}
          detail={view.notifications ? `${view.notifications.sent24h} sent, ${view.notifications.failed24h} failed in 24h` : undefined}
          tone={view.notifications && view.notifications.failed24h > 0 ? "amber" : "neutral"}
          href="/admin/notifications"
          index={3}
        />
        <AdminStat
          label="Pastes in 24h"
          value={view.extraction ? String(view.extraction.ready24h + view.extraction.failed24h) : "n/a"}
          detail={view.extraction ? `${view.extraction.failed24h} failed, ${view.extraction.stuckRunning} stuck` : undefined}
          tone={view.extraction && view.extraction.stuckRunning > 0 ? "amber" : "neutral"}
          href="/admin/pastes"
          index={4}
        />
      </div>

      <AdminCard
        title="Scheduled jobs"
        blurb="Two clocks per job: when pg_cron fired it, and when this app actually ran it. They should agree. When pg_cron is on time and the app is silent, pg_net is not reaching the app."
        flush
        index={5}
      >
        <AdminTableScroller>
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className={ADMIN_TH}>Job</th>
                <th className={ADMIN_TH}>Every</th>
                <th className={ADMIN_TH}>pg_cron fired</th>
                <th className={ADMIN_TH}>App ran</th>
                <th className={ADMIN_TH}>Last success</th>
                <th className={ADMIN_TH}>State</th>
              </tr>
            </thead>
            <tbody>
              {view.jobs.map((j) => (
                <tr key={j.job} className={ADMIN_TR}>
                  <td className={ADMIN_TD}>
                    <div className="flex flex-col">
                      <span className="font-semibold">{j.label}</span>
                      <span className="font-mono text-[11px] text-tm-text-3">{j.job}{j.liveSchedule ? ` · ${j.liveSchedule}` : ""}</span>
                    </div>
                  </td>
                  <td className={ADMIN_TD}>{describeMinutes(j.everyMinutes)}</td>
                  <td className={ADMIN_TD}>{ago(j.cronLastStart, now)}{j.cronLastStatus && j.cronLastStatus !== "succeeded" ? ` (${j.cronLastStatus})` : ""}</td>
                  <td className={ADMIN_TD}>{ago(j.appLastRun, now)}{j.lastDurationMs !== null ? ` · ${(j.lastDurationMs / 1000).toFixed(1)}s` : ""}</td>
                  <td className={ADMIN_TD}>{ago(j.appLastSuccess, now)}</td>
                  <td className={ADMIN_TD}>
                    {!j.scheduled ? (
                      <AdminBadge tone="coral">Not scheduled</AdminBadge>
                    ) : !j.active ? (
                      <AdminBadge tone="coral">Off</AdminBadge>
                    ) : j.unreached ? (
                      <AdminBadge tone="coral">Not reaching app</AdminBadge>
                    ) : j.stale ? (
                      <AdminBadge tone={j.appLastSuccess ? "coral" : "amber"}>{j.appLastSuccess ? "Stale" : "No heartbeat yet"}</AdminBadge>
                    ) : j.consecutiveFailures > 0 ? (
                      <AdminBadge tone="amber">{j.consecutiveFailures} failing</AdminBadge>
                    ) : (
                      <AdminBadge tone="green">Healthy</AdminBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableScroller>
      </AdminCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminCard title="Payments still pending" blurb={`Oldest first. Anything older than ${view.timeouts.expiryMinutes} minutes should have been released by the reconciliation job.`} flush index={6}>
          {!view.payments ? (
            <div className="p-5"><AdminEmpty title="Unavailable" body="The payments table could not be read." /></div>
          ) : view.payments.pending.length === 0 ? (
            <div className="p-5"><AdminEmpty title="None pending" body="Every payment ever started has resolved one way or the other." /></div>
          ) : (
            <AdminTableScroller>
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr>
                    <th className={ADMIN_TH}>Reference</th>
                    <th className={ADMIN_TH}>Amount</th>
                    <th className={ADMIN_TH}>Waiting</th>
                    <th className={ADMIN_TH}>For</th>
                  </tr>
                </thead>
                <tbody>
                  {view.payments.pending.map((p) => {
                    const mins = ageMinutes(p.created_at, now);
                    return (
                      <tr key={p.id} className={ADMIN_TR}>
                        <td className={ADMIN_TD}>
                          <Link href={`/admin/transactions/${p.id}`} className="font-mono text-[12px] underline-offset-2 hover:underline">{p.reference}</Link>
                        </td>
                        <td className={`${ADMIN_TD} tm-nums`}>GH₵ {(p.amount / 100).toFixed(2)}</td>
                        <td className={ADMIN_TD}>
                          <AdminBadge tone={mins > view.timeouts.expiryMinutes + 15 ? "coral" : mins > view.timeouts.expiryMinutes ? "amber" : "neutral"}>{describeMinutes(mins)}</AdminBadge>
                        </td>
                        <td className={ADMIN_TD}>{p.order_group_id ? "a bag" : p.order_id ? "one order" : "unknown"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </AdminTableScroller>
          )}
        </AdminCard>

        <div className="flex flex-col gap-6">
          <AdminCard title="How payments resolved, 7 days" index={7}>
            {view.payments ? (
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <Figure label="Succeeded" value={view.payments.resolved7d.successful} />
                <Figure label="Declined" value={view.payments.resolved7d.failed} />
                <Figure label="Released unpaid" value={view.payments.resolved7d.expired} />
                <Figure label="Paid after release" value={view.payments.resolved7d.recovered} />
              </dl>
            ) : (
              <AdminEmpty title="Unavailable" body="The audit log could not be read." />
            )}
          </AdminCard>

          <AdminCard title="Vendor budgets this month" index={8}>
            {!view.budgets ? (
              <AdminEmpty title="Unavailable" body="job_budgets could not be read." />
            ) : view.budgets.length === 0 ? (
              <AdminEmpty title="Nothing spent yet" body="No job has drawn on a vendor budget this period." />
            ) : (
              <ul className="flex flex-col gap-2">
                {view.budgets.map((b) => (
                  <li key={b.job} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="font-semibold text-tm-ink">{b.job}</span>
                    <span className="tm-nums text-tm-text-2">{b.used} / {b.cap}</span>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>

          <AdminCard title="Catalogue" index={9}>
            {view.catalog ? (
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <Figure label="Products" value={view.catalog.products} />
                <Figure label="New in 24h" value={view.catalog.new24h} />
                <div className="col-span-2 flex flex-col">
                  <dt className="text-tm-text-3">Last scrape saw a product</dt>
                  <dd className="font-semibold text-tm-ink">{ago(view.catalog.lastSeenAt, now)}</dd>
                </div>
              </dl>
            ) : (
              <AdminEmpty title="Unavailable" body="catalog_products could not be read." />
            )}
          </AdminCard>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-tm-text-3">{label}</dt>
      <dd className="tm-nums font-display text-[20px] leading-none font-bold text-tm-ink">{value}</dd>
    </div>
  );
}

function ago(iso: string | null, now: Date): string {
  if (!iso) return "never";
  return formatRelativeTime(iso, now) ?? iso;
}

function levelTone(level: OpsAlertLevel): AdminTone {
  return level === "critical" ? "coral" : level === "warning" ? "amber" : "neutral";
}

function levelLabel(level: OpsAlertLevel): string {
  return level === "critical" ? "Act now" : level === "warning" ? "Look" : "Note";
}
