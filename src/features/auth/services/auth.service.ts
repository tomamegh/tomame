import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { AuthenticatedUser } from "@/types/domain";
import type { MessageResponse } from "@/types/api";
import { LoginSchemaType } from "../schema";
import { AuthUserResponse } from "../types";

export async function signup(
  email: string,
  password: string,
): Promise<AuthUserResponse> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (
      error.status === 422 ||
      error.message.toLowerCase().includes("already registered")
    ) {
      throw new APIError(409, "Email already registered");
    }
    logger.error("Supabase signUp failed", { error: error.message });
    throw new APIError(500, "Registration failed");
  }

  if (!data.user) {
    throw new APIError(500, "Registration failed");
  }

  await logAuditEvent({
    actorId: data.user.id,
    actorRole: "user",
    action: "user_registered",
    entityType: "user",
    entityId: data.user.id,
  });

  return { id: data.user.id, email: data.user.email!, role: "user" };
}

export async function login(
  details: LoginSchemaType,
): Promise<AuthUserResponse> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword(details);

  if (error) {
    throw new APIError(401, "Invalid email or password");
  }

  const { data: dbUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", data.user.id)
    .single();

  if (!dbUser) {
    throw new APIError(500, "User record not found");
  }

  await logAuditEvent({
    actorId: dbUser.id,
    actorRole: dbUser.role,
    action: "user_logged_in",
    entityType: "user",
    entityId: dbUser.id,
  });

  return { email: data.user.email!, id: data.user.id, role: dbUser.role };
}

/**
 * Send a password reset email.
 * Always returns success to prevent email enumeration.
 */
export async function forgotPassword(
  email: string,
): Promise<MessageResponse> {
  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/reset-password`,
  });

  if (error) {
    logger.error("resetPasswordForEmail failed", { error: error.message });
  }

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

  return { message: "If an account exists, a reset link has been sent" };
}

export async function resetPassword(
  _userId: string,
  password: string,
): Promise<MessageResponse> {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    logger.error("Reset password failed", { error: error.message });
    throw new APIError(400, "Password reset failed");
  }

  return { message: "Password has been reset" };
}

export async function changePassword(
  _userId: string,
  newPassword: string,
): Promise<MessageResponse> {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    logger.error("Change password failed", { error: error.message });
    throw new APIError(400, "Password change failed");
  }

  return { message: "Password changed successfully" };
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
