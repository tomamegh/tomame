import type { PlatformUser } from "@/features/users/types";
import { canAccessAdmin } from "./admin-access";
import { APIError } from "./api-helpers";

/**
 * Type-narrowing guard: ensures user is authenticated.
 * Returns a typed user or an error tuple.
 */
export function requireAuth(user: PlatformUser | null) {
  if (!user) throw new APIError(401, "Authentication Required");
  return user;
}

/**
 * Type-narrowing guard: ensures user is an admin.
 * Must only be called after requireAuth succeeds.
 *
 * `canAccessAdmin` is the single rule. This used to test `profile.role`, the
 * database column, while the services the route then called tested the JWT
 * claim. On hosted Supabase the two disagree for every real admin (the claim
 * is set by `custom_access_token_hook`; the row `getUser()` is built from is
 * not), so the route admitted the admin and the service refused them one call
 * later. One predicate, asked once, cannot do that.
 */
export function requireAdmin(
  user: PlatformUser,
) {
  if (!canAccessAdmin(user)) {
    throw new APIError(403, "Admin access required");
  }
  return user;
}
