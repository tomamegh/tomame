import type { OpsAlert } from "./ops-alerts";

/**
 * When the platform emails a person, pure and framework-free so every rule is
 * tested with fixtures (`__tests__/alert-rules.test.ts`).
 *
 * The bar is "someone should look at this now". Everything below it is in the
 * 07:00 summary and on /admin/ops, which is where a customer's typo belongs.
 */

export const ALERT_RULES = {
  /**
   * A fingerprint first seen this recently is "new". An hour, not the 5-minute
   * schedule: an alert held back by the hourly email cap, or a run that did not
   * happen, is still a candidate on the next run. It equals the per-key
   * throttle on purpose, so a new issue is emailed once and then ages out.
   */
  newErrorWindowMinutes: 60,
  /** The same alert key is emailed at most once per this. */
  perKeyThrottleMinutes: 60,
  /** Across all keys: alert emails per rolling hour. More than this is held for the next allowed run. */
  maxAlertEmailsPerHour: 4,
  /** Items listed in one digest; the rest are counted. */
  maxItemsPerEmail: 15,
  /** Server-side errors in the last hour: at least this many, and this many times the hourly norm. */
  serverSpike: { minLastHour: 10, multiple: 3 },
  /** Forms refused by routes (browser-reported 400/422) in the last hour. */
  clientSpike: { minLastHour: 25, multiple: 4 },
  /** Tracked webhook warnings (bad signature, bad payload) in the last hour. */
  webhookWarnings: { minLastHour: 5 },
  /** Notification sends in the last hour. */
  notificationFailures: { minFailedLastHour: 5, minFailureRatio: 0.2 },
} as const;

export type AlertLevel = "critical" | "warning";

export interface AlertCandidate {
  /** Stable while the same thing is wrong; what the throttle keys on. */
  key: string;
  level: AlertLevel;
  title: string;
  detail: string;
  href?: string;
}

export interface ErrorEventInput {
  fingerprint: string;
  level: "error" | "warn";
  category: string;
  message: string;
  source: string | null;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
}

export interface HourlyCountInput {
  fingerprint: string;
  bucket: string;
  category: string;
  level: "error" | "warn";
  occurrences: number;
}

/**
 * Zod's wording for a value of the wrong TYPE or shape, as opposed to a rule a
 * person can break ("Enter a phone number"). A route answering one of these to
 * its own form is the contract bug of 2026-09-30, not a typo.
 */
const CONTRACT_ERROR = /Invalid input: expected|expected \w+, received|Unrecognized key|Invalid option: expected|Required$|Invalid JSON|Nothing to update/i;

export function isContractError(message: string): boolean {
  return CONTRACT_ERROR.test(message);
}

const minutesAgo = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000);

function describeSource(source: string | null): string {
  if (!source) return "an unnamed place";
  return source.replace(/^api:/, "").replace(/^cron:/, "the ").replace(/^client:4xx /, "").replace(/^client:\w+ /, "the screen ");
}

/** First occurrences, and payment faults that are still happening. */
export function errorEventCandidates(events: ErrorEventInput[], now: Date): AlertCandidate[] {
  const since = minutesAgo(now, ALERT_RULES.newErrorWindowMinutes).toISOString();
  const out: AlertCandidate[] = [];
  for (const e of events) {
    const isNew = e.first_seen_at >= since;
    const recent = e.last_seen_at >= since;
    const where = describeSource(e.source);
    const message = e.message.slice(0, 240);

    if (e.category === "client_4xx") {
      if (isNew && isContractError(e.message)) {
        out.push({
          key: `error:${e.fingerprint}`,
          level: "warning",
          title: "A form is being refused by its own API",
          detail: `${where} answered "${message}". That wording means the page sent something the route does not accept, which is a bug, not a customer mistake.`,
          href: "/admin/ops",
        });
      }
      continue;
    }
    if (e.level !== "error") continue;

    if (isNew) {
      const critical = e.category === "server_5xx" || e.category === "payment" || e.category === "job" || e.category === "server";
      out.push({
        key: `error:${e.fingerprint}`,
        level: critical ? "critical" : "warning",
        title: `New ${labelOf(e.category)}`,
        detail: `First seen in ${where}: ${message}`,
        href: "/admin/ops",
      });
    } else if (recent && e.category === "payment") {
      out.push({
        key: `error:${e.fingerprint}`,
        level: "critical",
        title: "Payment fault still happening",
        detail: `${e.occurrences} occurrence${e.occurrences === 1 ? "" : "s"} so far, the latest in ${where}: ${message}`,
        href: "/admin/transactions",
      });
    }
  }
  return out;
}

function labelOf(category: string): string {
  switch (category) {
    case "server_5xx":
      return "server error";
    case "payment":
      return "payment error";
    case "job":
      return "background job error";
    case "notification":
      return "notification error";
    case "client_crash":
      return "screen crash";
    default:
      return "error";
  }
}

export interface HourlyWindow {
  lastHour: number;
  /** Mean per hour over the 24 hours before the last one. */
  baselinePerHour: number;
}

/**
 * Occurrences in the last hour against the day before it.
 *
 * Buckets are whole hours (083), so "the last hour" is the current bucket and
 * the previous one: between 60 and 120 minutes. Generous on purpose: a spike
 * that straddles the hour must not be split in two and missed.
 */
export function hourlyWindow(rows: HourlyCountInput[], now: Date, match: (r: HourlyCountInput) => boolean): HourlyWindow {
  const currentBucket = new Date(now);
  currentBucket.setUTCMinutes(0, 0, 0);
  const recentFrom = currentBucket.getTime() - 3600_000;
  const baselineFrom = recentFrom - 24 * 3600_000;
  let lastHour = 0;
  let baseline = 0;
  for (const r of rows) {
    if (!match(r)) continue;
    const t = new Date(r.bucket).getTime();
    if (t >= recentFrom) lastHour += r.occurrences;
    else if (t >= baselineFrom) baseline += r.occurrences;
  }
  return { lastHour, baselinePerHour: baseline / 24 };
}

export function isSpike(window: HourlyWindow, rule: { minLastHour: number; multiple: number }): boolean {
  // Two buckets count as "the last hour", so compare against two hours of norm.
  return window.lastHour >= rule.minLastHour && window.lastHour >= rule.multiple * Math.max(window.baselinePerHour * 2, 1);
}

export function spikeCandidates(rows: HourlyCountInput[], now: Date): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const server = hourlyWindow(rows, now, (r) => r.level === "error" && r.category !== "client_4xx" && r.category !== "client_crash");
  if (isSpike(server, ALERT_RULES.serverSpike)) {
    out.push({
      key: "spike:server",
      level: "critical",
      title: "Error rate spike",
      detail: `${server.lastHour} server-side errors in about the last hour, against a norm of ${server.baselinePerHour.toFixed(1)} an hour.`,
      href: "/admin/ops",
    });
  }
  const client = hourlyWindow(rows, now, (r) => r.category === "client_4xx" || r.category === "client_crash");
  if (isSpike(client, ALERT_RULES.clientSpike)) {
    out.push({
      key: "spike:client",
      level: "warning",
      title: "Customers are hitting errors",
      detail: `${client.lastHour} refused forms or crashed screens reported by browsers in about the last hour, against a norm of ${client.baselinePerHour.toFixed(1)} an hour.`,
      href: "/admin/ops",
    });
  }
  const webhook = hourlyWindow(rows, now, (r) => r.level === "warn" && r.category === "payment");
  if (webhook.lastHour >= ALERT_RULES.webhookWarnings.minLastHour) {
    out.push({
      key: "spike:payment-webhook",
      level: "critical",
      title: "Paystack webhooks are being rejected",
      detail: `${webhook.lastHour} webhook deliveries failed the signature or payload check in about the last hour. A rotated PAYSTACK_SECRET_KEY rejects every real payment confirmation this way.`,
      href: "/admin/ops",
    });
  }
  return out;
}

export function notificationCandidates(stats: { failedLastHour: number; sentLastHour: number }): AlertCandidate[] {
  const { failedLastHour: failed, sentLastHour: sent } = stats;
  const rule = ALERT_RULES.notificationFailures;
  const total = failed + sent;
  if (failed < rule.minFailedLastHour || total === 0 || failed / total < rule.minFailureRatio) return [];
  return [
    {
      key: "notifications:failing",
      level: "critical",
      title: "Notifications are failing",
      detail: `${failed} of ${total} notifications in the last hour failed to send. Check RESEND_API_KEY, the WhatsApp token and the failed rows.`,
      href: "/admin/notifications",
    },
  ];
}

/**
 * From the Health screen's own alarms: the critical ones, and a job failing
 * over and over. "New errors today" is left out because the per-fingerprint
 * rule above says the same thing more precisely.
 */
const EMAILED_WARNINGS = /^job-failing:/;
const SKIPPED = new Set(["errors-new", "errors-open"]);

export function opsSnapshotCandidates(alerts: OpsAlert[]): AlertCandidate[] {
  return alerts
    .filter((a) => !SKIPPED.has(a.key) && (a.level === "critical" || EMAILED_WARNINGS.test(a.key)))
    .map((a) => ({ key: `ops:${a.key}`, level: a.level === "critical" ? "critical" : "warning", title: a.title, detail: a.detail, href: a.href ?? "/admin/ops" }));
}

export interface ThrottleLogRow {
  alert_key: string;
  last_sent_at: string;
}

export interface AlertSelection {
  send: AlertCandidate[];
  /** Due but held back by the hourly email cap; they go in the next allowed email. */
  held: AlertCandidate[];
  /** Already emailed within the per-key window. */
  throttled: number;
}

/**
 * Which candidates go out in this run's email.
 *
 * One run sends at most one email: a single alert or a digest of all of them.
 * A key already sent within `perKeyThrottleMinutes` waits; when the hourly cap
 * is reached everything due waits, un-stamped, so it is in the next email
 * rather than lost.
 */
export function selectAlertsToSend(
  candidates: AlertCandidate[],
  log: ThrottleLogRow[],
  sendsInLastHour: number,
  now: Date,
): AlertSelection {
  const cutoff = minutesAgo(now, ALERT_RULES.perKeyThrottleMinutes).toISOString();
  const lastSent = new Map(log.map((l) => [l.alert_key, l.last_sent_at]));
  const seen = new Set<string>();
  const due: AlertCandidate[] = [];
  let throttled = 0;
  for (const c of candidates) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    const last = lastSent.get(c.key);
    if (last && last > cutoff) {
      throttled += 1;
      continue;
    }
    due.push(c);
  }
  due.sort((a, b) => (a.level === b.level ? 0 : a.level === "critical" ? -1 : 1));
  if (due.length === 0) return { send: [], held: [], throttled };
  if (sendsInLastHour >= ALERT_RULES.maxAlertEmailsPerHour) return { send: [], held: due, throttled };
  return { send: due, held: [], throttled };
}

export function alertSubject(send: AlertCandidate[], envLabel: string | null): string {
  const prefix = envLabel ? `[Tomame ${envLabel}]` : "[Tomame]";
  if (send.length === 1 && send[0]) return `${prefix} ${send[0].title}`;
  const critical = send.filter((a) => a.level === "critical").length;
  return `${prefix} ${send.length} platform alerts${critical ? ` (${critical} critical)` : ""}`;
}
