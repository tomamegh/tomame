import crypto from "crypto";

/**
 * Where `logger.error` goes when nobody is reading the function log.
 *
 * Vercel's log is searchable for a short retention and alerts on nothing, so an
 * error that happens at 3am on a Sunday is invisible unless someone goes
 * looking. This writes a grouped row to `error_events` (062) instead, which the
 * Health screen reads and alarms on.
 *
 * THREE RULES, because this runs on the unhappy path:
 *
 *  1. It never throws and never blocks. A failure here is swallowed to the
 *     console, and the call site gets its console line whatever happens.
 *  2. It never recurses. A failed write logs with `console.error`, never with
 *     `logger.error`, or one broken database turns into an infinite loop.
 *  3. It redacts first. CLAUDE.md forbids logging secrets or PII, and the meta
 *     objects at 108 call sites were written for a console, not for a table.
 */

/** Keys whose value never leaves the process, whatever a call site passes. */
const SECRET_KEY = /pass|secret|token|key|authorization|cookie|session|signature|dsn/i;
/** Keys that identify a person. Ids are fine; names and contact details are not. */
const PII_KEY = /email|phone|address|first_?name|last_?name|full_?name|recipient|customer_?name/i;

const MAX_STRING = 300;
const MAX_KEYS = 25;

/**
 * Drop what must not be stored, shorten what would bloat the row, and turn a
 * URL into its host (which store misbehaved is diagnostic; which product a
 * named customer bought is not ours to keep here).
 */
export function redactMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!meta) return null;
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of Object.entries(meta)) {
    if (count >= MAX_KEYS) break;
    if (SECRET_KEY.test(key)) { out[key] = "[redacted]"; count += 1; continue; }
    if (PII_KEY.test(key)) { out[key] = "[redacted]"; count += 1; continue; }
    out[key] = redactValue(value);
    count += 1;
  }
  return out;
}

function redactValue(value: unknown): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return shortenString(value);
  if (Array.isArray(value)) return value.slice(0, 5).map(redactValue);
  if (typeof value === "object") {
    const nested = redactMeta(value as Record<string, unknown>);
    return nested;
  }
  return String(value).slice(0, MAX_STRING);
}

function shortenString(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).host;
    } catch {
      return "[url]";
    }
  }
  return trimmed.length > MAX_STRING ? `${trimmed.slice(0, MAX_STRING)}…` : trimmed;
}

/**
 * What makes two occurrences the same issue.
 *
 * The message with its variable parts removed: uuids, numbers, quoted strings
 * and hex blobs. Without that, "order 8d66… failed" and "order c8c5… failed"
 * are two issues and the list is a log again.
 */
export function fingerprintOf(message: string, source: string | null): string {
  const normalised = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hash>")
    .replace(/"[^"]*"|'[^']*'/g, "<str>")
    .replace(/\b\d+(\.\d+)?\b/g, "<n>")
    .trim()
    .slice(0, 400);
  return crypto.createHash("sha256").update(`${source ?? ""}::${normalised}`).digest("hex").slice(0, 32);
}

/**
 * At most one write per fingerprint per this window, per instance. A hot loop
 * must not turn one bug into thousands of database round trips; the occurrences
 * it skips are carried forward and added to the next write, so the count stays
 * true.
 */
const WRITE_WINDOW_MS = 10_000;
const pending = new Map<string, { skipped: number; lastWriteMs: number }>();

/** Reset between tests. */
export function resetErrorSink(): void {
  pending.clear();
}

export interface ErrorSinkEntry {
  level: "error" | "warn";
  message: string;
  meta?: Record<string, unknown>;
}

/**
 * Record one error. Fire and forget: the caller is on the unhappy path already
 * and must not wait for a database, so this returns immediately and the write
 * settles on its own.
 */
export function captureError(entry: ErrorSinkEntry): void {
  // Middleware and any edge runtime: console only. Importing the Supabase
  // service client there would pull the node SDK into the edge bundle, and the
  // proxy is the one place that must stay tiny.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  // Tests and local scripts write to whatever database they are pointed at;
  // without a service key there is nothing to write with.
  if (!process.env.SUPABASE_SECRET_KEY) return;

  try {
    const source = typeof entry.meta?.source === "string" ? entry.meta.source : null;
    const fingerprint = fingerprintOf(entry.message, source);
    const now = Date.now();
    const seen = pending.get(fingerprint);
    if (seen && now - seen.lastWriteMs < WRITE_WINDOW_MS) {
      seen.skipped += 1;
      return;
    }
    const occurrences = 1 + (seen?.skipped ?? 0);
    pending.set(fingerprint, { skipped: 0, lastWriteMs: now });

    void writeErrorEvent({
      fingerprint,
      level: entry.level,
      message: entry.message,
      source,
      context: redactMeta(entry.meta),
      occurrences,
    });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: "error sink failed", detail: String(error) }));
  }
}

interface ErrorEventWrite {
  fingerprint: string;
  level: "error" | "warn";
  message: string;
  source: string | null;
  context: Record<string, unknown> | null;
  occurrences: number;
}

async function writeErrorEvent(row: ErrorEventWrite): Promise<void> {
  try {
    // Imported lazily so nothing on the happy path pays for it, and so a module
    // that only ever logs does not drag the service-role client in with it.
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { error } = await createAdminClient().rpc("record_error_event", {
      p_fingerprint: row.fingerprint,
      p_level: row.level,
      p_message: row.message,
      p_source: row.source,
      p_context: row.context,
      p_occurrences: row.occurrences,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    // console, never logger: see rule 2 above.
    console.error(JSON.stringify({ level: "error", message: "error sink write failed", detail: String(error) }));
  }
}
