import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Delete every auth session (and so every refresh token) the user holds, via
 * `revoke_user_sessions` (077). supabase-js has no sign-out-by-user-id: its
 * `auth.admin.signOut` takes the user's own JWT. With the session row gone,
 * GoTrue's `/user` (what `getAuthenticatedUser` calls) rejects their current
 * access token and a refresh fails, so the next request is signed out.
 * Returns the number of sessions ended. Throws on error.
 */
export async function revokeUserSessions(userId: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("revoke_user_sessions", { p_user_id: userId });
  if (error) throw new Error(`revoke_user_sessions failed: ${error.message}`);
  return Number(data ?? 0);
}
