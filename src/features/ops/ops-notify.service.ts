import "server-only";

import {
  claimDailySummary,
  countAlertSendsSince,
  listAlertLog,
  listErrorEventsByFingerprint,
  listErrorEventsSeenSince,
  listHourlyCountsSince,
  listRecentAlertSends,
  readAlertRecipientsSetting,
  readDayActivity,
  readNotificationOutcomesSince,
  recordAlertSend,
  releaseDailySummary,
  stampAlertLog,
  type AlertSendRow,
} from "@/db/queries/ops-alerts";
import { sendEmail } from "@/lib/email/transport";
import { opsAlertTemplate, opsDailySummaryTemplate } from "@/lib/email/templates/ops-alert";
import { logger } from "@/lib/logger";
import {
  ALERT_RULES,
  alertSubject,
  errorEventCandidates,
  notificationCandidates,
  opsSnapshotCandidates,
  selectAlertsToSend,
  spikeCandidates,
  type AlertCandidate,
} from "./alert-rules";
import { alertsEnabled, environmentLabel, resolveRecipients } from "./alert-recipients";
import { accraDate, buildDailySummary, dailySummarySubject, type DailySummary } from "./daily-summary";
import { getOpsOverview, type OpsOverview } from "./ops.service";

/**
 * The two jobs that email a person (083): alerts every five minutes, the
 * health summary at 07:00. Both run as pg_cron → pg_net → a Vercel route.
 *
 * TESTABLE SEND. `send` and `env` are injected; the routes pass the real
 * Resend transport and `process.env`, tests pass a mock. Nothing here decides
 * a rule (that is `alert-rules.ts` and `daily-summary.ts`); this gathers, asks
 * the rules, sends, and records what went out.
 */

export type SendFn = (message: { to: string; subject: string; html: string; text: string }) => Promise<void>;

export interface NotifyDeps {
  send: SendFn;
  env: Record<string, string | undefined>;
  now: Date;
}

export function defaultNotifyDeps(): NotifyDeps {
  return { send: sendEmail, env: process.env, now: new Date() };
}

const minutesBefore = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

async function degrade<T>(work: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await work;
  } catch (error) {
    logger.warn(`ops notify: ${label} failed`, { error: error instanceof Error ? error.message : String(error) });
    return fallback;
  }
}

async function recipientsFor(env: NotifyDeps["env"]) {
  const setting = await degrade(readAlertRecipientsSetting(), null, "recipients");
  return resolveRecipients(env.OPS_ALERT_RECIPIENTS, setting);
}

/** One email to each recipient. Returns how many failed; never throws. */
async function deliver(send: SendFn, recipients: string[], mail: { subject: string; html: string; text: string }): Promise<number> {
  let failed = 0;
  for (const to of recipients) {
    try {
      await send({ to, ...mail });
    } catch (error) {
      failed += 1;
      // warn, not error: an error here would itself become an alert about the
      // alert email, and the heartbeat already records the failed run.
      logger.warn("ops notify: email not delivered", { error: error instanceof Error ? error.message : String(error) });
    }
  }
  return failed;
}

// ── Alerts ──────────────────────────────────────────────────────────────────

export async function gatherAlertCandidates(now: Date): Promise<AlertCandidate[]> {
  const [events, hourly, notifications, overview] = await Promise.all([
    degrade(listErrorEventsSeenSince(minutesBefore(now, ALERT_RULES.newErrorWindowMinutes)), [], "recent errors"),
    degrade(listHourlyCountsSince(minutesBefore(now, 26 * 60)), [], "hourly counts"),
    degrade(readNotificationOutcomesSince(minutesBefore(now, 60)), { failed: 0, sent: 0 }, "notification outcomes"),
    getOpsOverview(now),
  ]);
  return [
    ...errorEventCandidates(events, now),
    ...spikeCandidates(hourly, now),
    ...notificationCandidates({ failedLastHour: notifications.failed, sentLastHour: notifications.sent }),
    ...opsSnapshotCandidates(overview.alerts),
  ];
}

export async function runOpsAlerts(deps: NotifyDeps = defaultNotifyDeps()): Promise<Record<string, unknown>> {
  const { now, env } = deps;
  const candidates = await gatherAlertCandidates(now);
  if (candidates.length === 0) return { candidates: 0, sent: 0 };

  const [log, sendsLastHour] = await Promise.all([
    listAlertLog([...new Set(candidates.map((c) => c.key))]),
    countAlertSendsSince("alert", minutesBefore(now, 60)),
  ]);
  const selection = selectAlertsToSend(candidates, log, sendsLastHour, now);
  const summary = { candidates: candidates.length, throttled: selection.throttled, held: selection.held.length, sent: 0 };
  if (selection.send.length === 0) return summary;

  const environment = environmentLabel(env);
  const subject = alertSubject(selection.send, environment);
  if (!alertsEnabled(env)) {
    // Evaluated and not sent, and NOT stamped: turning alerts on later must
    // not find everything already marked as delivered.
    logger.info("ops alerts: would send (disabled on this deployment)", { subject, keys: selection.send.map((a) => a.key) });
    return { ...summary, dryRun: true, wouldSend: selection.send.length, subject };
  }

  const { recipients } = await recipientsFor(env);
  const listed = selection.send.slice(0, ALERT_RULES.maxItemsPerEmail);
  const mail = opsAlertTemplate({
    subject,
    alerts: listed,
    more: selection.send.length - listed.length,
    environment,
    generatedAt: now.toISOString(),
  });
  const failed = await deliver(deps.send, recipients, mail);
  if (failed === recipients.length) {
    throw new Error(`alert email reached none of ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`);
  }

  await stampAlertLog(selection.send.map((a) => ({ key: a.key, level: a.level, title: a.title })), now.toISOString(), log);
  await recordAlertSend({ kind: "alert", subject, alertKeys: selection.send.map((a) => a.key), recipients: recipients.length, failed });
  return { ...summary, sent: selection.send.length, recipients: recipients.length, failedRecipients: failed };
}

// ── The daily summary ───────────────────────────────────────────────────────

export async function collectDailySummary(now: Date, known?: OpsOverview): Promise<DailySummary> {
  const dayAgo = minutesBefore(now, 24 * 60);
  const [overview, hourly, activity, recentEvents, alertEmails24h] = await Promise.all([
    known ? Promise.resolve(known) : getOpsOverview(now),
    degrade(listHourlyCountsSince(minutesBefore(now, 25 * 60)), [], "hourly counts"),
    degrade(readDayActivity(dayAgo), { orders: [], payments: [], notifications: [], warehouseActions: null }, "day activity"),
    degrade(listErrorEventsSeenSince(dayAgo), [], "recent errors"),
    degrade(countAlertSendsSince("alert", dayAgo), 0, "alert sends"),
  ]);

  // The wording for every fingerprint the hourly table names, including ones
  // whose last occurrence has since moved out of the "seen since" read above.
  const seen = new Set(recentEvents.map((e) => e.fingerprint));
  const missing = [...new Set(hourly.map((h) => h.fingerprint))].filter((fp) => !seen.has(fp)).slice(0, 100);
  const extra = await degrade(listErrorEventsByFingerprint(missing), [], "issue wording");

  return buildDailySummary({
    now,
    orders: activity.orders,
    payments: activity.payments,
    notifications: activity.notifications,
    hourly,
    events: [...recentEvents, ...extra],
    jobs: overview.jobs,
    alerts: overview.alerts,
    warehouseActions: activity.warehouseActions,
    alertEmails24h,
  });
}

export async function runDailySummary(deps: NotifyDeps = defaultNotifyDeps()): Promise<Record<string, unknown>> {
  const { now, env } = deps;
  const summary = await collectDailySummary(now);
  const environment = environmentLabel(env);
  const subject = dailySummarySubject(summary, environment);

  if (!alertsEnabled(env)) {
    logger.info("ops daily summary: would send (disabled on this deployment)", { subject });
    return { dryRun: true, subject, status: summary.status };
  }

  const date = accraDate(now);
  const claim = await claimDailySummary(date, subject);
  if (claim === null) return { skipped: "already sent", date };

  const { recipients } = await recipientsFor(env);
  const mail = opsDailySummaryTemplate(summary, subject, environment);
  const failed = await deliver(deps.send, recipients, mail);
  if (failed === recipients.length) {
    // Give the day back so the next call in the 07:00 hour can try again.
    await degrade(releaseDailySummary(claim), undefined, "release claim");
    throw new Error(`daily summary reached none of ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`);
  }
  await recordAlertSend({ id: claim, kind: "daily_summary", subject, alertKeys: [], recipients: recipients.length, failed });
  return { sent: true, date, status: summary.status, recipients: recipients.length, failedRecipients: failed };
}

// ── For /admin/ops ──────────────────────────────────────────────────────────

export interface OpsNotifyView {
  summary: DailySummary | null;
  recipients: string[];
  recipientsFrom: "env" | "setting" | "default";
  enabled: boolean;
  environment: string | null;
  recentSends: AlertSendRow[];
}

/** `overview` is the one the Health screen already read, so it is not read twice. */
export async function getOpsNotifyView(overview: OpsOverview): Promise<OpsNotifyView> {
  const env = process.env;
  const now = new Date(overview.generatedAt);
  const [summary, recipients, recentSends] = await Promise.all([
    degrade(collectDailySummary(now, overview), null, "daily summary"),
    recipientsFor(env),
    degrade(listRecentAlertSends(8), [], "recent sends"),
  ]);
  return {
    summary,
    recipients: recipients.recipients,
    recipientsFrom: recipients.from,
    enabled: alertsEnabled(env),
    environment: environmentLabel(env),
    recentSends,
  };
}
