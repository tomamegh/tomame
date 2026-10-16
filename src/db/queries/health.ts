import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One tiny PostgREST read, abandoned after `timeoutMs`. Throws on failure or
 * timeout. It goes through the same API gateway and connection pool the pages
 * use, so it fails the way they fail (2026-10-16: the database answered the
 * Management API while every PostgREST call timed out).
 */
export async function pingDatabase(timeoutMs: number): Promise<void> {
  const { error } = await createAdminClient()
    .from("site_settings")
    .select("key")
    .limit(1)
    .abortSignal(AbortSignal.timeout(timeoutMs));
  if (error) throw new Error(error.message || error.code || "database read failed");
}
