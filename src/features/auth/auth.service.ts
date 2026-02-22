import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/features/audit/audit.service";
import { resetPasswordTemplate } from "@/lib/email/templates/reset-password";
import { sendEmail } from "@/lib/email/transport";
import { logger } from "@/lib/logger";
import type { ServiceResult } from "@/types/domain";
import type { AuthUserResponse, MessageResponse } from "@/types/api";
import { LoginSchemaType } from "./schema";

/**
 * Register a new user.
 * Supabase sends the confirmation email automatically.
 * The DB trigger (on_auth_user_created) creates the public.users profile row.
 */
export async function signup(
  email: string,
  password: string
): Promise<ServiceResult<AuthUserResponse>> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (error.status === 422 || error.message.toLowerCase().includes("already registered")) {
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
  details: LoginSchemaType
): Promise<ServiceResult<AuthUserResponse>> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword(details);

  if (error) {
    return { success: false, error: "Invalid email or password", status: 401 };
  }

  // Load authoritative role from DB using admin client (bypasses RLS)
  // The server client's session may not be available for RLS in the same request
  const { data: dbUser, error:userError } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", data.user.id)
    .single();

  if (!dbUser) {
    return { success: false, error: "User record not found", status: 500 };
  }

  console.log(userError)

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
  email: string
): Promise<ServiceResult<MessageResponse>> {
  // Generate reset link via admin API (no email sent by Supabase)
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

  if (!linkError && linkData) {
    const template = resetPasswordTemplate(linkData.properties.action_link);
    await sendEmail({ to: email, ...template }).catch((err) =>
      logger.error("Failed to send reset email", { error: String(err) })
    );
  }

  // Always return success — never reveal whether email exists
  return {
    success: true,
    data: { message: "If an account exists, a reset link has been sent" },
  };
}

/**
 * Set a new password using an active session (from the reset link callback).
 * Takes the authenticated userId from the session (never from client input).
 */
export async function resetPassword(
  userId: string,
  password: string
): Promise<ServiceResult<MessageResponse>> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password,
  });

  if (error) {
    logger.error("Reset password failed", { error: error.message });
    return { success: false, error: "Password reset failed", status: 400 };
  }

  return {
    success: true,
    data: { message: "Password has been reset" },
  };
}

/**
 * Change password for an authenticated user.
 * Takes the authenticated userId from the session (never from client input).
 */
export async function changePassword(
  userId: string,
  newPassword: string
): Promise<ServiceResult<MessageResponse>> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) {
    logger.error("Change password failed", { error: error.message });
    return { success: false, error: "Password change failed", status: 400 };
  }

  return {
    success: true,
    data: { message: "Password changed successfully" },
  };
}
