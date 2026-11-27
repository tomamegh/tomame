import "server-only";

import type { NextRequest } from "next/server";

import { getUserSession } from "@/features/auth/services/auth.service";
import type { PlatformUser } from "@/features/users/types";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/** Every "Buy for a customer" route: the admin rate limit, then the admin claim. */
export async function requireAssistedOrderAdmin(request: NextRequest): Promise<PlatformUser> {
  if (!(await checkRateLimit(`admin-assisted-order:${getClientIp(request)}`, RATE_LIMIT.admin)).allowed) {
    throw new APIError(429, "Too many requests");
  }
  const { session, user } = await getUserSession();
  if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");
  return user;
}

export async function jsonBody(request: NextRequest): Promise<unknown> {
  return request.json().catch(() => {
    throw new APIError(400, "Invalid JSON");
  });
}
