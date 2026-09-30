import Link from "next/link";

import { ADMIN_TD, ADMIN_TH, ADMIN_TR, AdminBadge, AdminCard, AdminEmpty, AdminStat, AdminTableScroller } from "@/components/layout/admin";
import type { OpsNotifyView } from "@/features/ops/ops-notify.service";
import { formatRelativeTime } from "@/features/app-home/components/format";

/**
 * The last 24 hours in numbers (the same data as the 07:00 email) and who
 * gets the alert emails. Rendered under the alarms on /admin/ops.
 */
const CATEGORY_LABEL: Record<string, string> = {
  client_4xx: "Refused form",
  client_crash: "Screen crash",
  server_5xx: "Server",
  server: "Server",
  payment: "Payment",
  job: "Job",
  notification: "Notification",
};

export function OpsNotifyPanel({ view, renderedAt, index = 0 }: { view: OpsNotifyView; renderedAt: string; index?: number }) {
  const s = view.summary;
  const now = new Date(renderedAt);

  return (
    <div className="flex flex-col gap-6">
      <AdminCard
        title="Last 24 hours"
        blurb="The figures in the 07:00 health email. Refused forms are the browser reporting a 400 or 422 it showed a customer; a spike of one message there is usually a page and its route disagreeing."
        index={index}
      >
        {!s ? (
          <AdminEmpty title="Unavailable" body="The summary could not be read. If this database has not had migration 083 applied, that is why." />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <AdminStat label="Orders placed" value={String(s.orders.created)} detail={`${s.payments.success} paid, GH₵ ${s.payments.successGhs.toFixed(2)}`} tone="green" index={index + 1} />
              <AdminStat
                label="Server errors"
                value={String(s.errors.serverErrors + s.errors.paymentErrors + s.errors.jobErrors)}
                detail={`${s.errors.paymentErrors} payment, ${s.errors.jobErrors} job`}
                tone={s.errors.paymentErrors > 0 ? "coral" : s.errors.serverErrors > 0 ? "amber" : "neutral"}
                index={index + 2}
              />
              <AdminStat
                label="Refused forms"
                value={String(s.errors.clientRejections)}
                detail={`${s.errors.clientCrashes} screen crash${s.errors.clientCrashes === 1 ? "" : "es"}`}
                tone={s.errors.clientRejections + s.errors.clientCrashes > 0 ? "amber" : "neutral"}
                index={index + 3}
              />
              <AdminStat
                label="Warehouse actions"
                value={s.warehouse ? String(s.warehouse.total) : "n/a"}
                detail={s.warehouse ? topAction(s.warehouse.byAction) : "could not be read"}
                index={index + 4}
              />
            </div>

            {s.errors.top.length === 0 ? (
              <p className="text-[13px] font-medium text-tm-text-2">No errors recorded in the last day.</p>
            ) : (
              <AdminTableScroller>
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr>
                      <th className={ADMIN_TH}>Most frequent</th>
                      <th className={ADMIN_TH}>Kind</th>
                      <th className={ADMIN_TH}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.errors.top.map((t) => (
                      <tr key={t.fingerprint} className={ADMIN_TR}>
                        <td className={ADMIN_TD}>
                          <div className="flex min-w-0 flex-col">
                            <span className="line-clamp-2 font-semibold break-words">{t.message}</span>
                            {t.source ? <span className="truncate font-mono text-[11px] text-tm-text-3">{t.source}</span> : null}
                          </div>
                        </td>
                        <td className={ADMIN_TD}>
                          <span className="flex flex-wrap gap-1.5">
                            <AdminBadge tone={t.category === "payment" ? "coral" : t.category.startsWith("client") ? "amber" : "neutral"}>{CATEGORY_LABEL[t.category] ?? t.category}</AdminBadge>
                            {t.isNew ? <AdminBadge tone="coral">New</AdminBadge> : null}
                          </span>
                        </td>
                        <td className={`${ADMIN_TD} tm-nums`}>{t.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableScroller>
            )}

            <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">
              Email {s.notifications.email.sent} sent, {s.notifications.email.failed} failed. WhatsApp {s.notifications.whatsapp.sent} sent, {s.notifications.whatsapp.failed} failed.
              {" "}Jobs {s.jobs.healthy} of {s.jobs.total} healthy.
            </p>
          </div>
        )}
      </AdminCard>

      <AdminCard
        title="Alert emails"
        blurb="New server and payment errors, error spikes, stale jobs and failing notifications email this list, at most once an hour per alert. The health summary goes to the same list at 07:00 Accra time."
        action={<AdminBadge tone={view.enabled ? "green" : "muted"}>{view.enabled ? "Sending" : `Not sending${view.environment ? ` on ${view.environment}` : ""}`}</AdminBadge>}
        index={index + 5}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-[13px] font-semibold text-tm-ink">
              {view.recipients.join(", ")}
            </p>
            <p className="text-[12px] font-medium text-tm-text-3">
              {view.recipientsFrom === "env"
                ? "From OPS_ALERT_RECIPIENTS on this deployment, which overrides the setting."
                : view.recipientsFrom === "setting"
                  ? "From the ops_alert_recipients setting."
                  : "The built-in default: the ops_alert_recipients setting is empty or missing."}{" "}
              {view.recipientsFrom !== "env" ? (
                <Link href="/admin/content" className="font-semibold text-tm-coral-strong underline-offset-2 hover:underline">
                  Edit the list
                </Link>
              ) : null}
            </p>
          </div>

          {view.recentSends.length === 0 ? (
            <p className="text-[13px] font-medium text-tm-text-2">Nothing sent yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {view.recentSends.map((send) => (
                <li key={send.id} className="flex flex-col gap-0.5 rounded-[12px] bg-tm-paper px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="min-w-0 truncate text-[13px] font-semibold text-tm-ink">{send.subject}</span>
                  <span className="shrink-0 text-[12px] font-medium text-tm-text-3">
                    {formatRelativeTime(send.sent_at, now) ?? send.sent_at}
                    {send.failed > 0 ? `, ${send.failed} of ${send.recipients} failed` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AdminCard>
    </div>
  );
}

function topAction(byAction: Record<string, number>): string {
  const top = Object.entries(byAction).sort((a, b) => b[1] - a[1])[0];
  return top ? `most: ${top[0].replace(/_/g, " ")} (${top[1]})` : "none today";
}
