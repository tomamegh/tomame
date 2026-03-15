import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { logger } from "@/lib/logger";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
import type { MessageResponse } from "@/types/api";
import { LoginSchemaType } from "../schema";
import { AuthUserResponse } from "../types";

/**
 * Register a new user.
 * Supabase sends the confirmation email automatically.
 * The DB trigger (on_auth_user_created) creates the public.users profile row.
 */
export async function signup(
  email: string,
  password: string,
): Promise<ServiceResult<AuthUserResponse>> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (
      error.status === 422 ||
      error.message.toLowerCase().includes("already registered")
    ) {
      return { success: false, error: "Email already registered", status: 409 };
    }
    logger.error("Supabase signUp failed", { error: error.message });
    return { success: false, error: "Registration failed", status: 500 };
  }

  if (!data.user) {
    return { success: false, error: "Registration failed", status: 500 };
  }

  await logAuditEvent({
    actorId: data.user.id,
    actorRole: "user",
    action: "user_registered",
    entityType: "user",
    entityId: data.user.id,
  });

  return {
    success: true,
    data: { id: data.user.id, email: data.user.email!, role: "user" },
  };
}

/**
 * Log in a user. Sets session cookies via @supabase/ssr server client.
 * Returns the authoritative user role from the users table.
 */
export async function login(
  details: LoginSchemaType,
): Promise<ServiceResult<AuthUserResponse>> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword(details);

  if (error) {
    return { success: false, error: "Invalid email or password", status: 401 };
  }

  const { data: dbUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", data.user.id)
    .single();

  if (!dbUser) {
    return { success: false, error: "User record not found", status: 500 };
  }

  await logAuditEvent({
    actorId: dbUser.id,
    actorRole: dbUser.role,
    action: "user_logged_in",
    entityType: "user",
    entityId: dbUser.id,
  });

  return {
    success: true,
    data: { email: data.user.email!, id: data.user.id, role: dbUser.role },
  };
}

/**
 * Send a password reset email.
 * Always returns success to prevent email enumeration.
 */
export async function forgotPassword(
  email: string,
): Promise<ServiceResult<MessageResponse>> {
  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/reset-password`,
  });

  if (error) {
    logger.error("resetPasswordForEmail failed", { error: error.message });
  }

  // Look up user to audit log — non-fatal, enumeration-safe
  const { data: userData } = await createAdminClient()
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (userData) {
    await logAuditEvent({
      actorId: userData.id,
      actorRole: "user",
      action: "password_reset_requested",
      entityType: "user",
      entityId: userData.id,
    });
  }

  return {
    success: true,
    data: { message: "If an account exists, a reset link has been sent" },
  };
}

/**
 * Set a new password using an active session (from the reset link callback).
 * The caller (route handler) already verified the session via getAuthenticatedUser().
 */
export async function resetPassword(
  _userId: string,
  password: string,
): Promise<ServiceResult<MessageResponse>> {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    logger.error("Reset password failed", { error: error.message });
    return { success: false, error: "Password reset failed", status: 400 };
  }

  return { success: true, data: { message: "Password has been reset" } };
}

/**
 * Change password for an authenticated user.
 * The caller (route handler) already verified the session via getAuthenticatedUser().
 */
export async function changePassword(
  _userId: string,
  newPassword: string,
): Promise<ServiceResult<MessageResponse>> {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    logger.error("Change password failed", { error: error.message });
    return { success: false, error: "Password change failed", status: 400 };
  }

  return { success: true, data: { message: "Password changed successfully" } };
}

/**
 * Validates the current session and loads the user's authoritative role from DB.
 * Returns null if unauthenticated or if the user record is missing.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  // Load user profile — server client has the session so RLS allows the read
  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (!user || error) return null;

  return {
    id: user.id,
    email: authUser.email!,
    role: user.role,
    first_name: user?.first_name,
    last_name: user?.last_name,
  };
}
