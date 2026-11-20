/**
 * The paste batch being built in this tab (plan 2b), by paste id. In
 * sessionStorage so a reload or a trip to a quote and back keeps it; the reads
 * themselves live on the server and carry on regardless. Every access is
 * guarded: private mode or blocked storage just means a batch for this view.
 */

const BATCH_KEY = "tm:paste-batch";

export function readBatch(): string[] {
  try {
    const raw = window.sessionStorage.getItem(BATCH_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function writeBatch(ids: readonly string[]): void {
  try {
    if (ids.length === 0) window.sessionStorage.removeItem(BATCH_KEY);
    else window.sessionStorage.setItem(BATCH_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable: the batch lives for this page view only.
  }
}
