import "server-only";

import { captureError } from "@/lib/logger/error-sink";
import { normaliseRoutePath } from "@/lib/logger/route-source";
import type { ClientErrorReport } from "./client-error-schema";

/**
 * File one browser report in `error_events` (062/083).
 *
 * Grouped by what went wrong and where, never by who: `/api/orders/8d66…` and
 * `/api/orders/c8c5…` are one route, and the user id travels in the context
 * (the latest occurrence's) rather than the fingerprint, so ten customers
 * hitting one bug are one issue counted ten times.
 */
export interface ClientErrorViewer {
  userId: string | null;
  role: string | null;
}

export interface ClientErrorEvent {
  level: "error" | "warn";
  category: "client_4xx" | "client_crash";
  message: string;
  source: string;
  context: Record<string, unknown>;
}

export function toClientErrorEvent(report: ClientErrorReport, viewer: ClientErrorViewer): ClientErrorEvent {
  const page = report.page ? normaliseRoutePath(report.page) : null;
  const api = report.api ? normaliseRoutePath(report.api) : null;
  const isApi = report.kind === "api_4xx";
  return {
    level: isApi ? "warn" : "error",
    category: isApi ? "client_4xx" : "client_crash",
    message: isApi ? `${report.status ?? 400} from ${report.method ?? "GET"} ${api ?? "?"}: ${report.message}` : report.message,
    source: isApi ? `client:4xx ${report.method ?? "GET"} ${api ?? "?"}` : `client:${report.kind} ${page ?? "?"}`,
    context: {
      kind: report.kind,
      page,
      api,
      method: report.method ?? null,
      status: report.status ?? null,
      digest: report.digest ?? null,
      userId: viewer.userId,
      role: viewer.role,
    },
  };
}

export function recordClientError(report: ClientErrorReport, viewer: ClientErrorViewer): void {
  const event = toClientErrorEvent(report, viewer);
  captureError({
    level: event.level,
    category: event.category,
    message: event.message,
    meta: { source: event.source, ...event.context },
  });
}
