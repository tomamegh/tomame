import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitHit {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * One atomic upsert-increment on `rate_limits` through `hit_rate_limit` (077).
 * Service role only: the table has RLS on and no policies. Throws on any error;
 * the caller decides what a failed count means.
 */
export async function hitRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitHit> {
  const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error(`hit_rate_limit failed: ${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed: boolean; remaining: number; reset_at: string }
    | undefined;
  if (!row) throw new Error("hit_rate_limit returned no row");

  return {
    allowed: row.allowed === true,
    remaining: Number(row.remaining),
    resetAt: new Date(row.reset_at).getTime(),
  };
}
