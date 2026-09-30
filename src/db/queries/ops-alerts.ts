import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reads and writes behind the alert emailer and the daily summary (083).
 *
 * DATA ACCESS ONLY: what counts as an alert, a spike or a healthy day is
 * decided in `features/ops/alert-rules.ts` and `daily-summary.ts`. Every
 * table here is server-only (RLS on, no client grants), so the service-role
 * client is the only way in, behind the cron secret or an admin check.
 */

export interface ErrorEventLite {
  fingerprint: string;
  level: "error" | "warn";
  category: string;
  message: string;
  source: string | null;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
}

export interface HourlyCountRow {
  fingerprint: string;
  bucket: string;
  category: string;
  level: "error" | "warn";
  occurrences: number;
}

const EVENT_COLUMNS = "fingerprint, level, category, message, source, occurrences, first_seen_at, last_seen_at, resolved_at";

/** Issues that happened at all since `since`, newest first. */
export async function listErrorEventsSeenSince(since: string, limit = 200): Promise<ErrorEventLite[]> {
  const { data, error } = await createAdminClient()
    .from("error_events")
    .select(EVENT_COLUMNS)
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`ops alerts: error events failed: ${error.message}`);
  return (data ?? []) as unknown as ErrorEventLite[];
}

export async function listErrorEventsByFingerprint(fingerprints: string[]): Promise<ErrorEventLite[]> {
  if (fingerprints.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("error_events")
    .select(EVENT_COLUMNS)
    .in("fingerprint", fingerprints);
  if (error) throw new Error(`ops alerts: error events by fingerprint failed: ${error.message}`);
  return (data ?? []) as unknown as ErrorEventLite[];
}

export async function listHourlyCountsSince(since: string, limit = 5000): Promise<HourlyCountRow[]> {
  const { data, error } = await createAdminClient()
    .from("error_event_hourly")
    .select("fingerprint, bucket, category, level, occurrences")
    .gte("bucket", since)
    .order("bucket", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`ops alerts: hourly counts failed: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    fingerprint: String(r.fingerprint),
    bucket: String(r.bucket),
    category: String(r.category),
    level: r.level === "warn" ? "warn" : "error",
    occurrences: Number(r.occurrences),
  }));
}

// ── The throttle ────────────────────────────────────────────────────────────

export interface AlertLogRow {
  alert_key: string;
  level: string;
  title: string;
  last_sent_at: string;
  times_sent: number;
}

export async function listAlertLog(keys: string[]): Promise<AlertLogRow[]> {
  if (keys.length === 0) return [];
  const { data, error } = await createAdminClient().from("ops_alert_log").select("*").in("alert_key", keys);
  if (error) throw new Error(`ops alerts: alert log failed: ${error.message}`);
  return (data ?? []) as AlertLogRow[];
}

export async function stampAlertLog(rows: { key: string; level: string; title: string }[], sentAt: string, previous: AlertLogRow[]): Promise<void> {
  if (rows.length === 0) return;
  const times = new Map(previous.map((p) => [p.alert_key, p.times_sent]));
  const { error } = await createAdminClient()
    .from("ops_alert_log")
    .upsert(
      rows.map((r) => ({
        alert_key: r.key,
        level: r.level,
        title: r.title.slice(0, 300),
        last_sent_at: sentAt,
        times_sent: (times.get(r.key) ?? 0) + 1,
      })),
      { onConflict: "alert_key" },
    );
  if (error) throw new Error(`ops alerts: stamping the alert log failed: ${error.message}`);
}

export interface AlertSendRow {
  id: number;
  kind: "alert" | "daily_summary";
  sent_at: string;
  summary_date: string | null;
  subject: string;
  alert_keys: string[];
  recipients: number;
  failed: number;
}

export async function countAlertSendsSince(kind: "alert" | "daily_summary", since: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("ops_alert_sends")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind)
    .gte("sent_at", since);
  if (error) throw new Error(`ops alerts: counting sends failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Claim today's summary. False when a row for `summaryDate` already exists,
 * which the unique index (083) decides, so two overlapping runs cannot both
 * send it.
 */
export async function claimDailySummary(summaryDate: string, subject: string): Promise<number | null> {
  const { data, error } = await createAdminClient()
    .from("ops_alert_sends")
    .insert({ kind: "daily_summary", summary_date: summaryDate, subject })
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`ops alerts: claiming the daily summary failed: ${error.message}`);
  }
  return (data as { id: number } | null)?.id ?? null;
}

/** Release a claim whose every send failed, so the next run can try again. */
export async function releaseDailySummary(id: number): Promise<void> {
  const { error } = await createAdminClient().from("ops_alert_sends").delete().eq("id", id);
  if (error) throw new Error(`ops alerts: releasing the daily summary failed: ${error.message}`);
}

export async function recordAlertSend(row: {
  kind: "alert" | "daily_summary";
  subject: string;
  alertKeys: string[];
  recipients: number;
  failed: number;
  id?: number;
}): Promise<void> {
  const client = createAdminClient();
  const values = { subject: row.subject.slice(0, 300), alert_keys: row.alertKeys, recipients: row.recipients, failed: row.failed };
  const { error } = row.id
    ? await client.from("ops_alert_sends").update(values).eq("id", row.id)
    : await client.from("ops_alert_sends").insert({ kind: row.kind, ...values });
  if (error) throw new Error(`ops alerts: recording the send failed: ${error.message}`);
}

export async function listRecentAlertSends(limit = 10): Promise<AlertSendRow[]> {
  const { data, error } = await createAdminClient()
    .from("ops_alert_sends")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`ops alerts: recent sends failed: ${error.message}`);
  return (data ?? []) as AlertSendRow[];
}

// ── Recipients ──────────────────────────────────────────────────────────────

/** `site_settings.ops_alert_recipients` (private, so the service role reads it). */
export async function readAlertRecipientsSetting(): Promise<unknown> {
  const { data, error } = await createAdminClient()
    .from("site_settings")
    .select("value")
    .eq("key", "ops_alert_recipients")
    .maybeSingle();
  if (error) throw new Error(`ops alerts: recipients setting failed: ${error.message}`);
  return (data as { value?: unknown } | null)?.value ?? null;
}

// ── The day in numbers ──────────────────────────────────────────────────────

export interface DayActivity {
  orders: { status: string }[];
  payments: { status: string; amount: number }[];
  notifications: { channel: string; status: string }[];
  /** audit_logs actions starting `warehouse_`; null when the read failed. */
  warehouseActions: { action: string }[] | null;
}

/**
 * Status columns only, capped: a day on this platform is tens of rows, and the
 * cap keeps a bad day from turning the summary into a table scan.
 */
export async function readDayActivity(since: string): Promise<DayActivity> {
  const client = createAdminClient();
  const cap = 5000;
  const [orders, payments, notifications, warehouse] = await Promise.all([
    client.from("orders").select("status").gte("created_at", since).limit(cap),
    client.from("payments").select("status, amount").gte("created_at", since).limit(cap),
    client.from("notifications").select("channel, status").gte("created_at", since).limit(cap),
    client.from("audit_logs").select("action").like("action", "warehouse\\_%").gte("created_at", since).limit(cap),
  ]);
  if (orders.error) throw new Error(`ops summary: orders failed: ${orders.error.message}`);
  if (payments.error) throw new Error(`ops summary: payments failed: ${payments.error.message}`);
  if (notifications.error) throw new Error(`ops summary: notifications failed: ${notifications.error.message}`);
  return {
    orders: (orders.data ?? []) as { status: string }[],
    payments: ((payments.data ?? []) as { status: string; amount: number }[]).map((p) => ({ status: p.status, amount: Number(p.amount) })),
    notifications: (notifications.data ?? []) as { channel: string; status: string }[],
    warehouseActions: warehouse.error ? null : ((warehouse.data ?? []) as { action: string }[]),
  };
}

/** Notification outcomes since `since`, for the failure-spike rule. */
export async function readNotificationOutcomesSince(since: string): Promise<{ failed: number; sent: number }> {
  const client = createAdminClient();
  const [failed, sent] = await Promise.all([
    client.from("notifications").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since),
    client.from("notifications").select("id", { count: "exact", head: true }).eq("status", "sent").gte("created_at", since),
  ]);
  if (failed.error) throw new Error(`ops alerts: failed notifications failed: ${failed.error.message}`);
  if (sent.error) throw new Error(`ops alerts: sent notifications failed: ${sent.error.message}`);
  return { failed: failed.count ?? 0, sent: sent.count ?? 0 };
}
