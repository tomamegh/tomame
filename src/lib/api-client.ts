/**
 * Browser-side fetch helpers. Split out of `@/lib/auth/api-helpers`, which is
 * the server-side response toolkit and logs through `@/lib/logger` (server
 * only). Client components import from here.
 */

export class ApiFetchError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiFetchError(json.error ?? "Request failed", res.status);
  }
  return json as T;
}
