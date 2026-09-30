import type { ClientErrorReport } from "@/features/ops/client-error-schema";

/**
 * Tell the server something went wrong in this browser tab.
 *
 * Before this, a customer who saw "Could not save your profile" in a toast was
 * the only one who knew; the route answered 400, which is not an error to the
 * server, so nothing was logged anywhere (2026-09-30). This sends the route, the
 * status and the message the customer saw to `POST /api/ops/client-errors`,
 * which files it in `error_events` with the signed-in user's id.
 *
 * RULES, because this runs while something is already broken:
 *  - It never throws and never awaits: a report that fails is dropped.
 *  - It never sends a request body, a form value or a query string. The
 *    payload is the schema in `client-error-schema.ts` and nothing else.
 *  - It is throttled here (one per issue a minute, twenty per page load) and
 *    rate-limited again on the server, so a render loop cannot flood it.
 */
export const CLIENT_ERROR_ENDPOINT = "/api/ops/client-errors";

export interface ReportThrottle {
  /** True when this key may be sent now; records it as sent. */
  allow(key: string, nowMs: number): boolean;
}

export function createReportThrottle(opts: { windowMs: number; maxPerPage: number }): ReportThrottle {
  const lastSent = new Map<string, number>();
  let total = 0;
  return {
    allow(key, nowMs) {
      if (total >= opts.maxPerPage) return false;
      const last = lastSent.get(key);
      if (last !== undefined && nowMs - last < opts.windowMs) return false;
      lastSent.set(key, nowMs);
      total += 1;
      return true;
    },
  };
}

/** Same issue = same kind, same place, same words. */
export function reportKey(report: Pick<ClientErrorReport, "kind" | "api" | "page" | "status" | "message">): string {
  return [report.kind, report.api ?? report.page ?? "", report.status ?? "", report.message.slice(0, 120)].join("|");
}

const throttle = createReportThrottle({ windowMs: 60_000, maxPerPage: 20 });

export type ClientErrorInput = Omit<ClientErrorReport, "page">;

export function reportClientError(input: ClientErrorInput): void {
  try {
    if (typeof window === "undefined" || typeof fetch !== "function") return;
    const message = String(input.message ?? "").trim().slice(0, 500);
    if (!message) return;
    const report: ClientErrorReport = {
      ...input,
      message,
      page: window.location.pathname.slice(0, 200),
      digest: input.digest?.slice(0, 64),
    };
    if (report.api === CLIENT_ERROR_ENDPOINT) return;
    if (!throttle.allow(reportKey(report), Date.now())) return;

    void fetch(CLIENT_ERROR_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      // Survives the tab navigating away, which a crash often causes.
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    // Reporting is best effort by definition.
  }
}

/** The path of a same-origin `/api/...` URL, or null for anything else. */
export function apiPathOf(url: string): string | null {
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(url, base);
    if (parsed.origin !== base || !parsed.pathname.startsWith("/api/")) return null;
    return parsed.pathname.slice(0, 200);
  } catch {
    return null;
  }
}
