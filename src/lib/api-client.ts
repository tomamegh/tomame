/**
 * Browser-side fetch helpers. Split out of `@/lib/auth/api-helpers`, which is
 * the server-side response toolkit and logs through `@/lib/logger` (server
 * only). Client components import from here.
 */
import { apiPathOf, reportClientError } from "@/lib/observability/report-client-error";

export class ApiFetchError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Statuses reported to `error_events` from the browser. 400 and 422 are the
 * route refusing what the page sent: sometimes the customer's typo, sometimes
 * the page and the route disagreeing about the contract (the profile form's
 * `null`, 2026-09-30), and only the count across customers tells which. 401,
 * 403, 404, 409 and 429 are answers, not faults; 5xx the server records itself.
 */
const REPORTED_STATUSES = new Set([400, 422]);

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof json.error === "string" && json.error ? json.error : "Request failed";
    if (REPORTED_STATUSES.has(res.status)) {
      const api = apiPathOf(url);
      const method = (options?.method ?? "GET").toUpperCase();
      if (api) {
        reportClientError({
          kind: "api_4xx",
          api,
          method: METHODS.has(method) ? (method as "GET") : undefined,
          status: res.status,
          message,
        });
      }
    }
    throw new ApiFetchError(message, res.status);
  }
  return json as T;
}
