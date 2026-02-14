import type { AuthenticatedUser } from "@/types/domain";

/**
 * Type-narrowing guard: ensures user is authenticated.
 * Returns a typed user or an error tuple.
 */
export function requireAuth(
  user: AuthenticatedUser | null
): { ok: true; user: AuthenticatedUser } | { ok: false; status: 401; error: string } {
  if (!user) {
    return { ok: false, status: 401, error: "Authentication required" };
  }
  return { ok: true, user };
}

/**
 * Type-narrowing guard: ensures user is an admin.
 * Must only be called after requireAuth succeeds.
 */
export function requireAdmin(
  user: AuthenticatedUser
): { ok: true; user: AuthenticatedUser } | { ok: false; status: 403; error: string } {
  if (user.role !== "admin") {
    return { ok: false, status: 403, error: "Admin access required" };
  }
  return { ok: true, user };
}
