import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { insertUser } from "@/features/users/users.queries";
import { logAuditEvent } from "@/features/audit/audit.service";
import { sendEmail } from "@/lib/email/transport";
import { verifyEmailTemplate } from "@/lib/email/templates/verify-email";
import { resetPasswordTemplate } from "@/lib/email/templates/reset-password";
import { logger } from "@/lib/logger";
import type { ServiceResult } from "@/types/domain";
import type { AuthUserResponse, MessageResponse } from "@/types/api";

/**
 * Register a new user.
 * Creates Supabase Auth user + application users row.
 * Sends verification email via Nodemailer.
 * If the users insert fails, the auth user is rolled back.
 */
export async function signup(
  email: string,
  password: string
): Promise<ServiceResult<AuthUserResponse>> {
  // Create auth user (email_confirm: false — we send verification ourselves)
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
    });

  if (authError) {
    if (authError.message.includes("already been registered")) {
      return { success: false, error: "Email already registered", status: 409 };
    }
    logger.error("Supabase auth createUser failed", { error: authError.message });
    return { success: false, error: "Registration failed", status: 500 };
  }

  const userId = authData.user.id;

  // Insert application user record
  const dbUser = await insertUser(supabaseAdmin, {
    id: userId,
    email,
    role: "user",
  });

  if (!dbUser) {
    // Rollback: delete the auth user
    await supabaseAdmin.auth.admin.deleteUser(userId);
    logger.error("Users table insert failed, rolled back auth user", { userId });
    return { success: false, error: "Registration failed", status: 500 };
  }

  // Generate verification link and send via Nodemailer
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
    });

  if (linkError) {
    logger.error("Failed to generate verification link", { error: linkError.message });
  } else {
    const template = verifyEmailTemplate(linkData.properties.action_link);
    await sendEmail({ to: email, ...template }).catch((err) =>
      logger.error("Failed to send verification email", { error: String(err) })
    );
  }

  await logAuditEvent({
    actorId: userId,
    actorRole: "user",
    action: "user_registered",
    entityType: "user",
    entityId: userId,
  });

  return {
    success: true,
    data: { id: dbUser.id, email: dbUser.email, role: dbUser.role },
  };
}

/**
 * Log in a user. Sets session cookies via @supabase/ssr server client.
 * Returns the authoritative user role from the users table.
 */
export async function login(
  email: string,
  password: string
): Promise<ServiceResult<AuthUserResponse>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, error: "Invalid email or password", status: 401 };
  }

  // Load authoritative role from DB using admin client (bypasses RLS)
  // The server client's session may not be available for RLS in the same request
  const { data: dbUser } = await supabaseAdmin
    .from("users")
    .select("id, email, role")
    .eq("id", data.user.id)
    .single();

  if (!dbUser) {
    return { success: false, error: "User record not found", status: 500 };
  }

  return {
    success: true,
    data: { id: dbUser.id, email: dbUser.email, role: dbUser.role },
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
