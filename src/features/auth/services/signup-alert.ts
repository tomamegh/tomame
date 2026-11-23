import "server-only";

import { notifyStaff } from "@/features/staff-alerts/notify";

/** An account this young, signing in for the first time, is a new sign-up. */
export const NEW_SIGNUP_WINDOW_MS = 30 * 60_000;

/**
 * Tell staff about a new sign-up (2026-11-23), from the two places an account
 * first gets a session: the Google callback and the emailed confirm link. The
 * alert is keyed on the user, so a second sign-in inside the window sends nothing.
 */
export function alertIfNewSignup(user: { id: string; created_at?: string | null; app_metadata?: { provider?: string } | null } | null | undefined, now = Date.now()): boolean {
  if (!user?.id || !user.created_at) return false;
  const age = now - Date.parse(user.created_at);
  if (!Number.isFinite(age) || age < 0 || age > NEW_SIGNUP_WINDOW_MS) return false;
  notifyStaff({ kind: "new_signup", userId: user.id, method: user.app_metadata?.provider === "google" ? "google" : "email" });
  return true;
}
