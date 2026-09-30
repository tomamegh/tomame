import "server-only";
import { hitRateLimit } from "@/db/queries/rate-limits";
import { logger } from "@/lib/logger";

/**
 * Postgres-backed fixed-window rate limiter (`rate_limits`, migration 077).
 *
 * It used to be a Map in module memory, which on Vercel is one budget per
 * warm instance: parallel instances and every cold start each handed out a
 * fresh allowance. The count now lives in one row per key and window.
 *
 * Fails OPEN. A database blip must not lock every customer out of the site,
 * so a failed count allows the request and logs a warning.
 */

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const windowSeconds = Math.max(1, Math.round(config.windowMs / 1000));
  try {
    return await hitRateLimit(key, config.maxRequests, windowSeconds);
  } catch (error: unknown) {
    logger.warn("Rate limit check failed; allowing the request", {
      key: key.split(":")[0],
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: Date.now() + config.windowMs,
    };
  }
}

/**
 * The caller's IP. Vercel sets `x-forwarded-for` (client first) and
 * `x-real-ip`; only the first hop is the client, the rest are proxies. Using
 * the whole header as the key let a caller mint a new bucket per request by
 * sending their own `x-forwarded-for` prefix, and split one person across
 * buckets whenever the proxy chain changed.
 */
export function getClientIp(request: Pick<Request, "headers">): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  const real = request.headers.get("x-real-ip")?.trim();
  return real || "unknown";
}

/**
 * `user:<id>` for a signed-in caller, so people behind one carrier NAT do not
 * share a bucket; `ip:<addr>` otherwise.
 */
export function rateLimitSubject(
  request: Pick<Request, "headers">,
  userId?: string | null,
): string {
  return userId ? `user:${userId}` : `ip:${getClientIp(request)}`;
}
