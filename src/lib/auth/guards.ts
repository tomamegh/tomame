import type { AuthenticatedUser } from "@/features/auth/types";
import { APIError } from "./api-helpers";

/**
 * Type-narrowing guard: ensures user is authenticated.
 * Returns a typed user or an error tuple.
 */
export function requireAuth(user: AuthenticatedUser | null) {
  if (!user) throw new APIError(401, "Authentication Required");
  return user;
}

/**
 * Type-narrowing guard: ensures user is an admin.
 * Must only be called after requireAuth succeeds.
 */
export function requireAdmin(
  user: AuthenticatedUser,
) {
  if (user.profile.role !== "admin") {
    throw new APIError(403, 'You are not authorized to perform this action')
  }
  return user;
}
