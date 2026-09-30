import type { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import type { PlatformUser } from "@/features/users/types";
import { APIError } from "@/lib/auth/api-helpers";
import { requireAuth, requireWarehouse } from "@/lib/auth/guards";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * The opening lines of every `/api/warehouse/*` handler (081): rate limit,
 * signed in, warehouse role. The proxy has already refused anyone else; this is
 * the route's own check, and the service checks a third time.
 */
export async function authenticateWarehouse(
  request: NextRequest,
  bucket: string,
): Promise<PlatformUser> {
  const ip = getClientIp(request);
  if (!(await checkRateLimit(`warehouse-${bucket}:${ip}`, RATE_LIMIT.admin)).allowed) {
    throw new APIError(429, "Too many requests");
  }
  const user = requireAuth(await getAuthenticatedUser());
  return requireWarehouse(user);
}

/** A JSON body, or a 400 that says so. */
export async function readJson(request: NextRequest): Promise<unknown> {
  return request.json().catch(() => {
    throw new APIError(400, "Invalid JSON");
  });
}
